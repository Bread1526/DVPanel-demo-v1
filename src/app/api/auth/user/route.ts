
'use server';

import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData, type AuthenticatedUser } from '@/lib/session';
import { loadUserById, type UserData as FullUserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // For global debug mode
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { userSettingsSchema, defaultUserSettings, type UserSettingsData } from '@/lib/user-settings'; // For user-specific settings
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger';

// Type for the server-side session file ({username}-{role}-Auth.json)
// This file primarily tracks activity and specific session timeout settings.
// The primary session proof is the iron-session cookie.
type ServerSideSessionFileData = {
  userId: string; // To link back to the main user profile
  username: string;
  role: string;
  // token: string; // A token might be stored here if needed for external service validation or revoking specific file-based sessions.
  createdAt: number;
  lastActivity: number;
  sessionInactivityTimeoutMinutes: number;
  disableAutoLogoutOnInactivity: boolean;
};

export async function GET(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings(); // For global debug_mode flag
  // User specific debug mode is loaded later after user identification.
  const globalDebugMode = panelSettingsResult.data?.debugMode ?? false; 
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
    if (globalDebugMode) console.log('[API /auth/user] No active session found in cookie. Returning 401.');
    logEvent('Unknown', 'Unknown', 'AUTH_USER_NO_SESSION_COOKIE', 'INFO');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // At this point, iron-session cookie is valid. Now, check server-side session file for activity.
  const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
  const serverSessionFilename = `${safeUsername}-${safeRole}-Auth.json`; // This file stores activity for an iron-session
  
  if(globalDebugMode) console.log(`[API /auth/user] Cookie valid for ${session.username}. Looking for server session state file: ${serverSessionFilename}`);

  let serverSessionFileData: ServerSideSessionFileData | null = null;
  try {
    serverSessionFileData = await loadEncryptedData(serverSessionFilename) as ServerSideSessionFileData | null;
  } catch (e) {
    console.error(`[API /auth/user] Error loading server session file ${serverSessionFilename}:`, e);
    logEvent(session.username, session.role, 'AUTH_USER_SERVER_SESSION_LOAD_ERROR', 'ERROR', { error: (e as Error).message });
    await session.destroy(); 
    return NextResponse.json({ error: 'Session data error on server' }, { status: 500 });
  }

  if (!serverSessionFileData) {
    if (globalDebugMode) console.log(`[API /auth/user] Server session file ${serverSessionFilename} not found. Invalidating cookie session.`);
    logEvent(session.username, session.role, 'AUTH_USER_SERVER_SESSION_NOT_FOUND', 'WARN');
    await session.destroy();
    return NextResponse.json({ error: 'Session not found on server' }, { status: 401 });
  }

  // Perform inactivity check using data from serverSessionFileData
  if (!serverSessionFileData.disableAutoLogoutOnInactivity) {
    const timeoutMilliseconds = (serverSessionFileData.sessionInactivityTimeoutMinutes || 30) * 60 * 1000;
    if (Date.now() - serverSessionFileData.lastActivity > timeoutMilliseconds) {
      if (globalDebugMode) console.log(`[API /auth/user] Session for ${session.username} timed out due to inactivity. Deleting server session file and cookie.`);
      logEvent(session.username, session.role, 'AUTH_USER_INACTIVITY_TIMEOUT', 'INFO');
      try {
        const dataPath = getDataPath();
        await fs.unlink(path.join(dataPath, serverSessionFilename));
      } catch (e) {
        console.error(`[API /auth/user] Error deleting server session file ${serverSessionFilename} on inactivity timeout:`, e);
      }
      await session.destroy();
      return NextResponse.json({ error: 'Session timed out due to inactivity' }, { status: 401 });
    }
  }

  // Update lastActivity in the server-side session file & iron-session cookie
  serverSessionFileData.lastActivity = Date.now();
  session.lastActivity = Date.now(); // Also update in iron-session
  try {
    await saveEncryptedData(serverSessionFilename, serverSessionFileData);
    await session.save(); // This refreshes the cookie's own maxAge if set
    if (globalDebugMode) console.log(`[API /auth/user] Updated lastActivity in server session file ${serverSessionFilename} and refreshed iron-session cookie for ${session.username}.`);
  } catch (e) {
    console.error(`[API /auth/user] Error saving updated server session file ${serverSessionFilename} or iron-session:`, e);
    logEvent(session.username, session.role, 'AUTH_USER_ACTIVITY_UPDATE_FAILED', 'ERROR', { error: (e as Error).message });
    // Decide if this is a critical error, for now, proceed but log it
  }
  
  // Load full user profile
  const fullUser: FullUserData | null = await loadUserById(session.userId);

  if (!fullUser) {
    if (globalDebugMode) console.error(`[API /auth/user] CRITICAL: User profile for userId: ${session.userId} (username: ${session.username}) not found. Invalidating session.`);
    logEvent(session.username, session.role, 'AUTH_USER_PROFILE_NOT_FOUND', 'ERROR', { userId: session.userId });
    try {
      const dataPath = getDataPath();
      await fs.unlink(path.join(dataPath, serverSessionFilename));
    } catch (e) { /* ignore */ }
    await session.destroy();
    return NextResponse.json({ error: 'User profile not found, session invalidated.' }, { status: 401 });
  }
  
  // Load user-specific settings
  let userSpecificSettings: UserSettingsData = defaultUserSettings;
  const userSettingsFilename = `${safeUsername}-${safeRole}-settings.json`;
  try {
    const loadedUserSettings = await loadEncryptedData(userSettingsFilename);
    if (loadedUserSettings) {
      const parsed = userSettingsSchema.safeParse(loadedUserSettings);
      if (parsed.success) {
        userSpecificSettings = parsed.data;
      } else if (globalDebugMode) {
        console.warn(`[API /auth/user] User settings file ${userSettingsFilename} for ${session.username} is invalid/corrupted. Using defaults. Errors:`, parsed.error.flatten().fieldErrors);
      }
    } else if (globalDebugMode) {
       console.log(`[API /auth/user] No specific settings file ${userSettingsFilename} for ${session.username}. Defaults will be used by client.`);
    }
  } catch (e) {
    if (globalDebugMode) console.error(`[API /auth/user] Error loading user settings file ${userSettingsFilename} for ${session.username}:`, e);
  }

  const authenticatedUser: AuthenticatedUser = {
      id: fullUser.id,
      username: fullUser.username,
      role: fullUser.role,
      projects: fullUser.projects || [],
      assignedPages: fullUser.assignedPages || [],
      allowedSettingsPages: fullUser.allowedSettingsPages || [],
      status: fullUser.status,
      userSettings: userSpecificSettings, // Include user-specific settings
  };

  if (userSpecificSettings.debugMode || globalDebugMode) { // Log if either user's debug or global debug is on
    console.log(`[API /auth/user] Successfully returning authenticated user for ${fullUser.username}:`, { id: authenticatedUser.id, username: authenticatedUser.username, role: authenticatedUser.role, status: authenticatedUser.status, userSettingsDebug: authenticatedUser.userSettings?.debugMode });
  }

  return NextResponse.json({ user: authenticatedUser }, { status: 200 });
}
