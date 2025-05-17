'use server';

import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData, type AuthenticatedUser } from '@/lib/session';
import { loadUserById, type UserData as FullUserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { cookies } from 'next/headers';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';

// Structure for the server-side Auth JSON file
type ServerSessionAuthFileData = {
  userId: string;
  username: string;
  role: string;
  token: string; // This is the token stored in the file, not used by iron-session directly
  createdAt: number;
  lastActivity: number;
  sessionInactivityTimeoutMinutes: number;
  disableAutoLogoutOnInactivity: boolean;
};


export async function GET(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (debugMode) {
    console.log('[API /auth/user] Received GET request.');
    console.log('[API /auth/user] Cookie Session Data:', { 
      isLoggedIn: session.isLoggedIn, 
      userId: session.userId, 
      username: session.username, 
      role: session.role 
    });
  }

  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    if (debugMode) console.log('[API /auth/user] No active session found in cookie. Returning 401.');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Construct server-side session filename
  const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
  const serverSessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  
  if(debugMode) console.log(`[API /auth/user] Looking for server session file: ${serverSessionFilename}`);

  let serverSessionData: ServerSessionAuthFileData | null = null;
  try {
    serverSessionData = await loadEncryptedData(serverSessionFilename) as ServerSessionAuthFileData | null;
  } catch (e) {
    console.error(`[API /auth/user] Error loading server session file ${serverSessionFilename}:`, e);
    await session.destroy(); // Destroy cookie session if server file is problematic
    return NextResponse.json({ error: 'Session data error on server' }, { status: 500 });
  }

  if (!serverSessionData) {
    if (debugMode) console.log(`[API /auth/user] Server session file ${serverSessionFilename} not found. Invalidating cookie session. Returning 401.`);
    await session.destroy(); // Destroy cookie session if server file is missing
    return NextResponse.json({ error: 'Session not found on server' }, { status: 401 });
  }

  // Perform inactivity check using data from serverSessionData
  if (!serverSessionData.disableAutoLogoutOnInactivity) {
    const timeoutMilliseconds = (serverSessionData.sessionInactivityTimeoutMinutes || 30) * 60 * 1000;
    if (Date.now() - serverSessionData.lastActivity > timeoutMilliseconds) {
      if (debugMode) console.log(`[API /auth/user] Session for ${session.username} timed out due to inactivity. Deleting server session file and cookie.`);
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

  // Update lastActivity in the server-side session file
  serverSessionData.lastActivity = Date.now();
  try {
    await saveEncryptedData(serverSessionFilename, serverSessionData);
    if (debugMode) console.log(`[API /auth/user] Updated lastActivity in server session file ${serverSessionFilename}.`);
  } catch (e) {
    console.error(`[API /auth/user] Error saving updated server session file ${serverSessionFilename}:`, e);
    // Decide if this is a critical error, for now, proceed but log it
  }
  
  // Also update lastActivity in the cookie session and save it to refresh cookie expiry
  session.lastActivity = Date.now();
  await session.save();
  if (debugMode) console.log(`[API /auth/user] Refreshed iron-session cookie for ${session.username}.`);


  // Now fetch the full user profile using session.userId
  if (debugMode) console.log(`[API /auth/user] Attempting to load full user profile for userId: ${session.userId}`);
  const fullUser: FullUserData | null = await loadUserById(session.userId);

  if (!fullUser) {
    if (debugMode) console.error(`[API /auth/user] CRITICAL: Could not load full user profile for userId: ${session.userId} (username: ${session.username}). This indicates an inconsistent state. Invalidating session.`);
    try {
      const dataPath = getDataPath();
      await fs.unlink(path.join(dataPath, serverSessionFilename)); // Delete server session file
    } catch (e) {
      console.error(`[API /auth/user] Error deleting server session file due to missing main user profile:`, e);
    }
    await session.destroy(); // Destroy cookie session
    return NextResponse.json({ error: 'User profile not found, session invalidated.' }, { status: 401 });
  }
  
  if (debugMode) console.log(`[API /auth/user] Successfully loaded full user profile for ${fullUser.username}:`, { id: fullUser.id, username: fullUser.username, role: fullUser.role, status: fullUser.status });
  
  const authenticatedUser: AuthenticatedUser = {
      id: fullUser.id,
      username: fullUser.username,
      role: fullUser.role,
      projects: fullUser.projects || [],
      assignedPages: fullUser.assignedPages || [],
      allowedSettingsPages: fullUser.allowedSettingsPages || [],
      status: fullUser.status,
      // Session related info for client, if needed (though usually not sent like this)
      // lastActivity: session.lastActivity, 
      // sessionInactivityTimeoutMinutes: session.sessionInactivityTimeoutMinutes,
      // disableAutoLogoutOnInactivity: session.disableAutoLogoutOnInactivity,
  };

  return NextResponse.json({ user: authenticatedUser }, { status: 200 });
}