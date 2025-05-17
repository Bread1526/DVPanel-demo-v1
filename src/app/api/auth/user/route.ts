
'use server';

import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData, type AuthenticatedUser, type FileSessionData } from '@/lib/session';
import { loadUserById } from '@/app/(app)/roles/actions'; 
import type { UserData as FullUserData } from '@/app/(app)/roles/types';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; 
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { userSettingsSchema, defaultUserSettings, type UserSettingsData } from '@/lib/user-settings';
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  // User specific debug mode is loaded later after user identification.
  const globalDebugMode = panelSettingsResult.data?.debugMode ?? false; // This global debugMode is not directly used in logic but good for initial logs if needed
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (globalDebugMode) {
    console.log('[API /auth/user] Received GET request.');
    console.log('[API /auth/user] IronSession Cookie Data:', { 
      isLoggedIn: session.isLoggedIn, 
      userId: session.userId, 
      username: session.username, 
      role: session.role 
    });
  }

  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    if (globalDebugMode) console.log('[API /auth/user] No active session found in iron-session cookie. Returning 401.');
    logEvent('Unknown', 'Unknown', 'AUTH_USER_NO_SESSION_COOKIE', 'INFO');
    return NextResponse.json({ error: 'Not authenticated via cookie.' }, { status: 401 });
  }
  
  const effectiveUsername = session.username;
  const effectiveRole = session.role;
  const safeUsername = effectiveUsername.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = effectiveRole.replace(/[^a-zA-Z0-9]/g, '_');
  const serverSessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  
  let userSpecificDebugMode = false; // Will be updated after loading user-specific settings

  if (globalDebugMode) console.log(`[API /auth/user] Cookie valid for ${effectiveUsername}. Looking for server session state file: ${serverSessionFilename}`);

  let serverSessionFileData: FileSessionData | null = null;
  try {
    serverSessionFileData = await loadEncryptedData(serverSessionFilename) as FileSessionData | null;
  } catch (e) {
    console.error(`[API /auth/user] Error loading server session file ${serverSessionFilename}:`, e);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_SERVER_SESSION_LOAD_ERROR', 'ERROR', { error: (e as Error).message });
    await session.destroy(); 
    return NextResponse.json({ error: 'Session data error on server (load fail).' }, { status: 500 });
  }

  if (!serverSessionFileData) {
    if (globalDebugMode) console.log(`[API /auth/user] Server session file ${serverSessionFilename} not found. Invalidating cookie session.`);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_SERVER_SESSION_NOT_FOUND', 'WARN');
    await session.destroy();
    return NextResponse.json({ error: 'Session not found on server (file missing).' }, { status: 401 });
  }

  // At this point, serverSessionFileData is loaded.
  // Now, load user-specific settings to determine userSpecificDebugMode.
  let userSpecificSettings: UserSettingsData = defaultUserSettings;
  const userSettingsFilename = `${safeUsername}-${safeRole}-settings.json`;
  try {
    const loadedUserSettings = await loadEncryptedData(userSettingsFilename);
    if (loadedUserSettings) {
      const parsed = userSettingsSchema.safeParse(loadedUserSettings);
      if (parsed.success) {
        userSpecificSettings = parsed.data;
        userSpecificDebugMode = userSpecificSettings.debugMode; // Set userSpecificDebugMode
      } else if (globalDebugMode || userSpecificDebugMode) { // Log if any debug mode is on
        console.warn(`[API /auth/user] User settings file ${userSettingsFilename} for ${effectiveUsername} is invalid/corrupted. Using defaults. Errors:`, parsed.error.flatten().fieldErrors);
      }
    } else if (globalDebugMode || userSpecificDebugMode) {
       console.log(`[API /auth/user] No specific settings file ${userSettingsFilename} for ${effectiveUsername}. Defaults will be used.`);
    }
  } catch (e) {
    if (globalDebugMode || userSpecificDebugMode) console.error(`[API /auth/user] Error loading user settings file ${userSettingsFilename} for ${effectiveUsername}:`, e);
  }
  
  const finalDebugMode = globalDebugMode || userSpecificDebugMode; // Combine global and user-specific debug flags

  // Perform inactivity check using data from serverSessionFileData
  if (!serverSessionFileData.disableAutoLogoutOnInactivity) {
    const timeoutMilliseconds = (serverSessionFileData.sessionInactivityTimeoutMinutes || 30) * 60 * 1000;
    if (Date.now() - serverSessionFileData.lastActivity > timeoutMilliseconds) {
      if (finalDebugMode) console.log(`[API /auth/user] Session for ${effectiveUsername} timed out due to inactivity. Deleting server session file and cookie.`);
      logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_INACTIVITY_TIMEOUT', 'INFO');
      try {
        const dataPath = getDataPath();
        await fs.unlink(path.join(dataPath, serverSessionFilename));
      } catch (e) {
        if (finalDebugMode) console.error(`[API /auth/user] Error deleting server session file ${serverSessionFilename} on inactivity timeout:`, e);
      }
      await session.destroy();
      return NextResponse.json({ error: 'Session timed out due to inactivity', reason: 'inactive' }, { status: 401 });
    }
  }

  // Update lastActivity in the server-side session file & iron-session cookie
  serverSessionFileData.lastActivity = Date.now();
  session.lastActivity = Date.now(); // Also update in iron-session for its own potential expiry refresh
  try {
    await saveEncryptedData(serverSessionFilename, serverSessionFileData);
    await session.save(); // This refreshes the cookie's own maxAge if set by iron-session
    if (finalDebugMode) console.log(`[API /auth/user] Updated lastActivity in server session file ${serverSessionFilename} and refreshed iron-session cookie for ${effectiveUsername}.`);
  } catch (e) {
    if (finalDebugMode) console.error(`[API /auth/user] Error saving updated server session file ${serverSessionFilename} or iron-session:`, e);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_ACTIVITY_UPDATE_FAILED', 'ERROR', { error: (e as Error).message });
  }
  
  // Load full user profile
  if (finalDebugMode) console.log(`[API /auth/user] Attempting to load full user profile for userId: ${session.userId}`);
  const fullUser: FullUserData | null = await loadUserById(session.userId!); // userId is guaranteed by initial check

  if (!fullUser) {
    if (finalDebugMode) console.error(`[API /auth/user] CRITICAL: Main user profile for userId: ${session.userId} (username: ${effectiveUsername}) not found. Invalidating session and deleting server session file.`);
    logEvent(effectiveUsername, effectiveRole, 'AUTH_USER_MAIN_PROFILE_NOT_FOUND', 'ERROR', { userId: session.userId });
    try { // Attempt to delete the orphaned server session file
        const dataPath = getDataPath();
        await fs.unlink(path.join(dataPath, serverSessionFilename));
        if(finalDebugMode) console.log(`[API /auth/user] Deleted orphaned server session file ${serverSessionFilename}.`);
    } catch (e) { /* ignore if deletion fails */ }
    await session.destroy();
    return NextResponse.json({ error: 'User main profile not found, session invalidated.' }, { status: 401 });
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
  };

  if (finalDebugMode) {
    console.log(`[API /auth/user] Successfully returning authenticated user for ${fullUser.username}:`, { id: authenticatedUser.id, username: authenticatedUser.username, role: authenticatedUser.role, status: authenticatedUser.status, userSettingsDebug: authenticatedUser.userSettings?.debugMode });
  }

  return NextResponse.json({ user: authenticatedUser }, { status: 200 });
}
