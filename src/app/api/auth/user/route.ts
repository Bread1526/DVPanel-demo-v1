
'use server';

import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData, type AuthenticatedUser, type FileSessionData } from '@/lib/session';
import { loadUserById, type UserData as FullUserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings, type PanelSettingsData } from '@/app/(app)/settings/actions';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { userSettingsSchema, defaultUserSettings, type UserSettingsData } from '@/lib/user-settings';
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const panelGlobalSettingsResult = await loadPanelSettings();
  const globalDebugModeForApi = panelGlobalSettingsResult.data?.debugMode ?? false;

  if (globalDebugModeForApi) {
    console.log('[API /auth/user] Received GET request.');
  }

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (globalDebugModeForApi) {
    console.log('[API /auth/user] IronSession Cookie Data:', { 
      isLoggedIn: session.isLoggedIn, 
      userId: session.userId, 
      username: session.username, 
      role: session.role,
      lastActivityCookie: session.lastActivity ? new Date(session.lastActivity).toISOString() : undefined,
      isImpersonating: session.isImpersonating,
      originalUsername: session.originalUsername,
    });
  }

  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    if (globalDebugModeForApi) console.log('[API /auth/user] No active session in iron-session cookie. Returning 401.');
    // logEvent(session.username || 'UnknownUser', session.role || 'Unknown', 'AUTH_USER_NO_SESSION_COOKIE', 'INFO'); // User unknown here
    return NextResponse.json({ error: 'Not authenticated via cookie' }, { status: 401 });
  }

  const effectiveUsername = session.username;
  const effectiveRole = session.role;
  const effectiveUserId = session.userId;

  const serverSessionFilename = `${effectiveUsername.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${effectiveRole.replace(/[^a-zA-Z0-9]/g, '_')}-Auth.json`;
  
  if(globalDebugModeForApi) console.log(`[API /auth/user] Cookie valid for effective user: ${effectiveUsername}. Looking for server session file: ${serverSessionFilename}`);

  let serverSessionFileData: FileSessionData | null = null;
  try {
    serverSessionFileData = await loadEncryptedData(serverSessionFilename) as FileSessionData | null;
  } catch (e: any) {
    console.error(`[API /auth/user] CRITICAL: Error loading server session file ${serverSessionFilename}:`, e);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_SERVER_SESSION_LOAD_ERROR', 'ERROR', { error: e.message, filename: serverSessionFilename });
    await session.destroy(); 
    return NextResponse.json({ error: 'Session data error on server. Please log in again.' }, { status: 401 });
  }

  if (!serverSessionFileData) {
    if (globalDebugModeForApi) console.log(`[API /auth/user] Server session file ${serverSessionFilename} for ${effectiveUsername} not found. Invalidating iron-session cookie.`);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_SERVER_SESSION_NOT_FOUND', 'WARN', { filename: serverSessionFilename });
    await session.destroy();
    return NextResponse.json({ error: 'Session not found on server. Please log in again.' }, { status: 401 });
  }

  // Inactivity Check
  if (!serverSessionFileData.disableAutoLogoutOnInactivity) {
    const timeoutMilliseconds = (serverSessionFileData.sessionInactivityTimeoutMinutes || 30) * 60 * 1000;
    if (Date.now() - serverSessionFileData.lastActivity > timeoutMilliseconds) {
      if (globalDebugModeForApi) console.log(`[API /auth/user] Session for ${effectiveUsername} timed out due to inactivity. Deleting server session file ${serverSessionFilename} and iron-session cookie.`);
      logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_INACTIVITY_TIMEOUT', 'INFO', { filename: serverSessionFilename });
      try {
        const dataPath = getDataPath();
        await fs.unlink(path.join(dataPath, serverSessionFilename));
        if (globalDebugModeForApi) console.log(`[API /auth/user] Deleted server session file ${serverSessionFilename} for ${effectiveUsername} due to inactivity.`);
      } catch (e: any) {
        if (e.code !== 'ENOENT') console.error(`[API /auth/user] Error deleting server session file ${serverSessionFilename} on timeout:`, e);
      }
      await session.destroy(); 
      return NextResponse.json({ error: 'Session timed out due to inactivity' }, { status: 401 });
    }
  }

  // Update lastActivity in server-side session file
  serverSessionFileData.lastActivity = Date.now();
  try {
    await saveEncryptedData(serverSessionFilename, serverSessionFileData);
    // Also update lastActivity in the iron-session cookie data and re-save to refresh its maxAge
    session.lastActivity = Date.now(); 
    await session.save();
    if (globalDebugModeForApi) console.log(`[API /auth/user] Updated lastActivity in server session file ${serverSessionFilename} and refreshed iron-session cookie for ${effectiveUsername}.`);
  } catch (e: any) {
    console.error(`[API /auth/user] Error saving updated server session file ${serverSessionFilename} or iron-session:`, e);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_ACTIVITY_UPDATE_FAILED', 'ERROR', { error: e.message, filename: serverSessionFilename });
    // Potentially invalidate session if saving fails critically
  }
  
  if (globalDebugModeForApi) console.log(`[API /auth/user] Attempting to load user profile for effective user ID: ${effectiveUserId} (Username: ${effectiveUsername}, Role: ${effectiveRole})`);
  const fullUser: FullUserData | null = await loadUserById(effectiveUserId);

  if (!fullUser) {
    if (globalDebugModeForApi) console.error(`[API /auth/user] CRITICAL: User profile for effective userId: ${effectiveUserId} (username: ${effectiveUsername}) not found. Invalidating session.`);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_PROFILE_NOT_FOUND', 'ERROR', { userId: effectiveUserId });
    try { 
      const dataPath = getDataPath();
      await fs.unlink(path.join(dataPath, serverSessionFilename));
      if (globalDebugModeForApi) console.log(`[API /auth/user] Deleted server session file ${serverSessionFilename} due to missing user profile.`);
    } catch (e: any) { 
      if (e.code !== 'ENOENT') console.error(`[API /auth/user] Error deleting server session file ${serverSessionFilename} after profile not found:`, e); 
    }
    await session.destroy();
    return NextResponse.json({ error: 'User profile not found, session invalidated. Please log in again.' }, { status: 401 });
  }
  
  // Load user-specific settings
  let userSpecificSettings: UserSettingsData = defaultUserSettings;
  const userSettingsFilename = `${effectiveUsername.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${effectiveRole.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
  try {
    const loadedUserSettingsRaw = await loadEncryptedData(userSettingsFilename);
    if (loadedUserSettingsRaw) {
      const parsedSettings = userSettingsSchema.safeParse(loadedUserSettingsRaw);
      if (parsedSettings.success) {
        userSpecificSettings = parsedSettings.data;
        if (globalDebugModeForApi) console.log(`[API /auth/user] Successfully loaded user-specific settings for ${effectiveUsername} from ${userSettingsFilename}`);
      } else {
        if (globalDebugModeForApi) console.warn(`[API /auth/user] User settings file ${userSettingsFilename} for ${effectiveUsername} is invalid. Using defaults and attempting to save. Errors:`, parsedSettings.error.flatten().fieldErrors);
        await saveEncryptedData(userSettingsFilename, defaultUserSettings); // Save defaults back
        logEvent(effectiveUsername, effectiveRole, 'USER_SETTINGS_INVALID_RESET', 'WARN', { filename: userSettingsFilename });
      }
    } else {
       if (globalDebugModeForApi) console.log(`[API /auth/user] No specific settings file ${userSettingsFilename} for ${effectiveUsername}. Using defaults and attempting to save.`);
       await saveEncryptedData(userSettingsFilename, defaultUserSettings); // Create with defaults
       logEvent(effectiveUsername, effectiveRole, 'USER_SETTINGS_CREATED_DEFAULT', 'INFO', { filename: userSettingsFilename });
    }
  } catch (e: any) {
    if (globalDebugModeForApi) console.error(`[API /auth/user] Error loading or saving user settings file ${userSettingsFilename} for ${effectiveUsername}:`, e.message);
    // Continue with default user settings if loading/saving failed
  }

  const authenticatedUser: AuthenticatedUser = {
      id: fullUser.id,
      username: fullUser.username,
      role: fullUser.role,
      projects: fullUser.projects || [],
      assignedPages: fullUser.assignedPages || [],
      allowedSettingsPages: fullUser.allowedSettingsPages || [],
      status: fullUser.status,
      userSettings: userSpecificSettings, 
      globalDebugMode: panelGlobalSettingsResult.data?.debugMode ?? false, // Send global debug mode status
      isImpersonating: session.isImpersonating,
      originalUsername: session.isImpersonating ? session.originalUsername : undefined,
  };

  if (userSpecificSettings.debugMode || globalDebugModeForApi) { 
    console.log(`[API /auth/user] Successfully returning authenticated user for ${fullUser.username}:`, { 
        id: authenticatedUser.id, 
        username: authenticatedUser.username, 
        role: authenticatedUser.role, 
        status: authenticatedUser.status, 
        userSettingsDebugMode: authenticatedUser.userSettings?.debugMode,
        globalPanelDebugMode: authenticatedUser.globalDebugMode,
        isImpersonating: authenticatedUser.isImpersonating,
        originalUsername: authenticatedUser.originalUsername,
    });
  }

  return NextResponse.json({ user: authenticatedUser }, { status: 200 });
}
