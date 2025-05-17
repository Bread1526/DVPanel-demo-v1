
// src/app/api/auth/user/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { type FileSessionData, type AuthenticatedUser } from '@/lib/session';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { loadUserById, type FullUserData } from '@/app/(app)/roles/actions'; 
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { loadPanelSettings } from '@/app/(app)/settings/actions';


export async function GET(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  const token = request.headers.get('X-Auth-Token');
  const username = request.headers.get('X-Auth-Username');
  const role = request.headers.get('X-Auth-Role');

  if (debugMode) {
    console.log('[API /auth/user] Received request. Token:', token ? 'Present' : 'Missing', 'Username:', username, 'Role:', role);
  }

  if (!token || !username || !role) {
    if (debugMode) console.log('[API /auth/user] Missing token, username, or role in headers.');
    return NextResponse.json({ error: 'Missing authentication credentials' }, { status: 401 });
  }

  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  const dataPath = getDataPath();
  const sessionFilePath = path.join(dataPath, sessionFilename);

  try {
    const sessionFileData = await loadEncryptedData(sessionFilename) as FileSessionData | null;

    if (!sessionFileData) {
      if (debugMode) console.log(`[API /auth/user] Session file not found: ${sessionFilename}`);
      return NextResponse.json({ error: 'Session not found or invalid' }, { status: 401 });
    }

    if (sessionFileData.token !== token) {
      if (debugMode) console.log(`[API /auth/user] Token mismatch for user ${username}. Deleting session file.`);
      // Token mismatch, invalidate session by deleting file
      try { await fs.unlink(sessionFilePath); } catch (e) { console.error(`[API /auth/user] Error deleting session file on token mismatch: ${sessionFilePath}`, e); }
      return NextResponse.json({ error: 'Invalid session token' }, { status: 401 });
    }

    // Check for inactivity timeout
    if (!sessionFileData.disableAutoLogoutOnInactivity) {
      const timeoutMilliseconds = (sessionFileData.sessionInactivityTimeoutMinutes || 30) * 60 * 1000;
      if (Date.now() - sessionFileData.lastActivity > timeoutMilliseconds) {
        if (debugMode) console.log(`[API /auth/user] Session timed out for user ${username} due to inactivity. Deleting session file.`);
        try { await fs.unlink(sessionFilePath); } catch (e) { console.error(`[API /auth/user] Error deleting session file on inactivity timeout: ${sessionFilePath}`, e); }
        return NextResponse.json({ error: 'Session timed out due to inactivity' }, { status: 401 });
      }
    }

    // Update lastActivity and re-save session file
    sessionFileData.lastActivity = Date.now();
    await saveEncryptedData(sessionFilename, sessionFileData);
    if (debugMode) console.log(`[API /auth/user] Session validated and lastActivity updated for ${username}.`);

    // Fetch full user details from the main user file (e.g., {username}-{role}.json)
    // This is important because -Auth.json only stores session-related data.
    const fullUser: FullUserData | null = await loadUserById(sessionFileData.userId);

    if (!fullUser) {
        if (debugMode) console.error(`[API /auth/user] Could not load full user profile for userId: ${sessionFileData.userId} (username: ${username}) after session validation. Deleting inconsistent session file.`);
        try { await fs.unlink(sessionFilePath); } catch (e) { console.error(`[API /auth/user] Error deleting session file due to missing main user profile: ${sessionFilePath}`, e); }
        return NextResponse.json({ error: 'User profile not found, session invalidated.' }, { status: 401 });
    }
    
    // Construct the AuthenticatedUser object to send back
    const authenticatedUser: AuthenticatedUser = {
        id: fullUser.id,
        username: fullUser.username,
        role: fullUser.role, // Role from the main user file is authoritative
        projects: fullUser.projects || [],
        assignedPages: fullUser.assignedPages || [],
        allowedSettingsPages: fullUser.allowedSettingsPages || [],
        status: fullUser.status,
    };

    return NextResponse.json({ user: authenticatedUser }, { status: 200 });

  } catch (error) {
    console.error('[API /auth/user] Error processing request:', error);
    return NextResponse.json({ error: 'Internal server error during authentication' }, { status: 500 });
  }
}
