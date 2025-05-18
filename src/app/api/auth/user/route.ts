
'use server';

import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData, type AuthenticatedUser, type FileSessionData } from '@/lib/session';
import { loadUserById, type UserData as FullUserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // Corrected import path
import { type PanelSettingsData } from '@/app/(app)/settings/types'; // Kept for type
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { userSettingsSchema, defaultUserSettings, type UserSettingsData } from '@/lib/user-settings';
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const panelGlobalSettingsResult = await loadPanelSettings();
  // Use global debugMode setting for this API route's internal logging
  const globalDebugModeForApi = panelGlobalSettingsResult.data?.debugMode ?? false;

  if (globalDebugModeForApi) {
    console.log('[API /auth/user] Received GET request.');
    // Avoid logging full headers directly unless absolutely necessary for deep debugging
    // console.log('[API /auth/user] Request Headers:', Object.fromEntries(request.headers.entries()));
  }

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (globalDebugModeForApi) {
    console.log('[API /auth/user] IronSession Cookie Data from Middleware/Login:', { 
      isLoggedIn: session.isLoggedIn, 
      userId: session.userId, 
      username: session.username, 
      role: session.role,
      lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : undefined,
      isImpersonating: session.isImpersonating,
      originalUsername: session.originalUsername,
      // Do not log sessionInactivityTimeoutMinutes or disableAutoLogoutOnInactivity directly from cookie
      // as they are now primarily managed by the server-side -Auth.json file.
    });
  }

  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    if (globalDebugModeForApi) console.log('[API /auth/user] No active session found in iron-session cookie. Returning 401.');
    logEvent(session.username || 'UnknownUser', session.role || 'Unknown', 'AUTH_USER_NO_SESSION_COOKIE', 'INFO');
    return NextResponse.json({ error: 'Not authenticated via cookie' }, { status: 401 });
  }

  // At this point, iron-session cookie says user is logged in.
  // The username/role in the cookie are for the *currently effective* user (original or impersonated).
  const effectiveUsername = session.username;
  const effectiveRole = session.role;
  const effectiveUserId = session.userId;

  const serverSessionFilename = `${effectiveUsername.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${effectiveRole.replace(/[^a-zA-Z0-9]/g, '_')}-Auth.json`;
  
  if(globalDebugModeForApi) console.log(`[API /auth/user] Cookie valid for effective user: ${effectiveUsername}. Looking for their server session state file: ${serverSessionFilename}`);

  let serverSessionFileData: FileSessionData | null = null;
  try {
    serverSessionFileData = await loadEncryptedData(serverSessionFilename) as FileSessionData | null;
  } catch (e: any) {
    console.error(`[API /auth/user] CRITICAL: Error loading server session file ${serverSessionFilename}:`, e);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_SERVER_SESSION_LOAD_ERROR', 'ERROR', { error: e.message, filename: serverSessionFilename });
    // If server session file can't be loaded, the session is invalid. Destroy cookie.
    await session.destroy(); 
    return NextResponse.json({ error: 'Session data error on server. Please log in again.' }, { status: 401 });
  }

  if (!serverSessionFileData) {
    if (globalDebugModeForApi) console.log(`[API /auth/user] Server session file ${serverSessionFilename} for effective user ${effectiveUsername} not found. Invalidating iron-session cookie.`);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_SERVER_SESSION_NOT_FOUND', 'WARN', { filename: serverSessionFilename });
    await session.destroy();
    return NextResponse.json({ error: 'Session not found on server. Please log in again.' }, { status: 401 });
  }

  // Perform inactivity check using data from the specific serverSessionFileData
  if (!serverSessionFileData.disableAutoLogoutOnInactivity) {
    const timeoutMilliseconds = (serverSessionFileData.sessionInactivityTimeoutMinutes || 30) * 60 * 1000;
    if (Date.now() - serverSessionFileData.lastActivity > timeoutMilliseconds) {
      if (globalDebugModeForApi) console.log(`[API /auth/user] Session for effective user ${effectiveUsername} timed out due to inactivity. Deleting server session file ${serverSessionFilename} and iron-session cookie.`);
      logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_INACTIVITY_TIMEOUT', 'INFO', { filename: serverSessionFilename });
      try {
        const dataPath = getDataPath();
        await fs.unlink(path.join(dataPath, serverSessionFilename));
      } catch (e: any) {
        if (e.code !== 'ENOENT') console.error(`[API /auth/user] Error deleting server session file ${serverSessionFilename} on inactivity timeout:`, e);
      }
      await session.destroy(); // Destroy iron-session cookie
      return NextResponse.json({ error: 'Session timed out due to inactivity' }, { status: 401 });
    }
  }

  // Update lastActivity in the server-side session file & re-save iron-session to refresh cookie's maxAge
  serverSessionFileData.lastActivity = Date.now();
  // Also update lastActivity in the iron-session cookie data to keep them in sync for middleware checks
  session.lastActivity = Date.now(); 
  try {
    await saveEncryptedData(serverSessionFilename, serverSessionFileData);
    await session.save(); // Refresh iron-session cookie
    if (globalDebugModeForApi) console.log(`[API /auth/user] Updated lastActivity in server session file ${serverSessionFilename} and refreshed iron-session cookie for effective user ${effectiveUsername}.`);
  } catch (e: any) {
    console.error(`[API /auth/user] Error saving updated server session file ${serverSessionFilename} or iron-session:`, e);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_ACTIVITY_UPDATE_FAILED', 'ERROR', { error: e.message, filename: serverSessionFilename });
    // Potentially return error here if save is critical, or just log and proceed
  }
  
  // Load full user profile for the *effective user*
  if (globalDebugModeForApi) console.log(`[API /auth/user] Attempting to load user profile for effective user ID: ${effectiveUserId}`);
  const fullUser: FullUserData | null = await loadUserById(effectiveUserId);

  if (!fullUser) {
    if (globalDebugModeForApi) console.error(`[API /auth/user] CRITICAL: User profile for effective userId: ${effectiveUserId} (username: ${effectiveUsername}) not found. Invalidating session.`);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_PROFILE_NOT_FOUND', 'ERROR', { userId: effectiveUserId });
    try { // Attempt to clean up server session file
      const dataPath = getDataPath();
      await fs.unlink(path.join(dataPath, serverSessionFilename));
    } catch (e: any) { if (e.code !== 'ENOENT') console.error(`[API /auth/user] Error deleting server session file ${serverSessionFilename} due to missing profile:`, e); }
    await session.destroy();
    return NextResponse.json({ error: 'User profile not found, session invalidated. Please log in again.' }, { status: 401 });
  }
  
  // Load user-specific settings for the *effective user*
  let userSpecificSettings: UserSettingsData = defaultUserSettings;
  const userSettingsFilename = `${effectiveUsername.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${effectiveRole.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
  try {
    const loadedUserSettings = await loadEncryptedData(userSettingsFilename);
    if (loadedUserSettings) {
      const parsed = userSettingsSchema.safeParse(loadedUserSettings);
      if (parsed.success) {
        userSpecificSettings = parsed.data;
      } else if (globalDebugModeForApi) {
        console.warn(`[API /auth/user] User settings file ${userSettingsFilename} for ${effectiveUsername} is invalid/corrupted. Using defaults. Errors:`, parsed.error.flatten().fieldErrors);
      }
    } else if (globalDebugModeForApi) {
       console.log(`[API /auth/user] No specific settings file ${userSettingsFilename} for ${effectiveUsername}. User-specific defaults will be used.`);
    }
  } catch (e: any) {
    if (globalDebugModeForApi) console.error(`[API /auth/user] Error loading user settings file ${userSettingsFilename} for ${effectiveUsername}:`, e.message);
  }

  // Construct the AuthenticatedUser object to return to the client
  const authenticatedUser: AuthenticatedUser = {
      id: fullUser.id,
      username: fullUser.username,
      role: fullUser.role,
      projects: fullUser.projects || [],
      assignedPages: fullUser.assignedPages || [],
      allowedSettingsPages: fullUser.allowedSettingsPages || [],
      status: fullUser.status,
      userSettings: userSpecificSettings,
      globalDebugMode: panelGlobalSettingsResult.data?.debugMode ?? false, // Pass global debug mode
      isImpersonating: session.isImpersonating,
      originalUsername: session.isImpersonating ? session.originalUsername : undefined,
  };

  const userDebugMode = userSpecificSettings.debugMode;
  if (userDebugMode || globalDebugModeForApi) {
    console.log(`[API /auth/user] Successfully returning authenticated user for ${fullUser.username}:`, { 
        id: authenticatedUser.id, 
        username: authenticatedUser.username, 
        role: authenticatedUser.role, 
        status: authenticatedUser.status, 
        userSettingsDebug: authenticatedUser.userSettings?.debugMode, // This is the user's own debug setting
        globalDebugModePanel: authenticatedUser.globalDebugMode, // This is the panel's global debug setting
        isImpersonating: authenticatedUser.isImpersonating,
        originalUsername: authenticatedUser.originalUsername,
    });
  }

  return NextResponse.json({ user: authenticatedUser }, { status: 200 });
}
