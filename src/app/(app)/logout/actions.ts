
"use server";

import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger'; 
import { loadPanelSettings } from '@/app/(app)/settings/actions';


export interface LogoutState {
  message: string;
  status: "success" | "error";
}

export async function logout(usernameFromClient?: string, roleFromClient?: string): Promise<LogoutState> {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  
  const loggedOutUsername = usernameFromClient || session.username || 'UnknownUser';
  const loggedOutRole = roleFromClient || session.role || 'Unknown';

  if (debugMode) {
    console.log(`[LogoutAction] Attempting logout for user: ${loggedOutUsername}, role: ${loggedOutRole}. Session isLoggedIn: ${session.isLoggedIn}`);
  }

  // Delete server-side session file if username and role are available
  if (session.isLoggedIn && session.username && session.role) {
    const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
    const dataPath = getDataPath();
    const sessionFilePath = path.join(dataPath, sessionFilename);

    try {
      await fs.unlink(sessionFilePath);
      if (debugMode) {
        console.log(`[LogoutAction] Server-side session file ${sessionFilename} deleted for ${session.username}.`);
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        if (debugMode) {
          console.warn(`[LogoutAction] Server-side session file ${sessionFilename} for ${session.username} not found, presumed already deleted.`);
        }
      } else {
        console.error(`[LogoutAction] Error deleting server-side session file ${sessionFilename} for ${session.username}:`, e);
        logEvent(loggedOutUsername, loggedOutRole, 'LOGOUT_SERVER_SESSION_DELETE_FAILED', 'ERROR', { filename: sessionFilename, error: e.message });
        // Continue with iron-session destruction even if file deletion fails
      }
    }
  } else if (usernameFromClient && roleFromClient) {
    // Attempt to delete file based on client-provided info if session lacks it (e.g., if session was already partially cleared)
    const safeUsername = usernameFromClient.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = roleFromClient.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
    const dataPath = getDataPath();
    const sessionFilePath = path.join(dataPath, sessionFilename);
    try { await fs.unlink(sessionFilePath); 
      if (debugMode) console.log(`[LogoutAction] Server-side session file ${sessionFilename} deleted based on client info for ${usernameFromClient}.`);
    } catch (e) { /* ignore if not found or other error, main goal is cookie destruction */ }
  }
  
  try {
    session.destroy(); // This clears the iron-session cookie
    if (debugMode) {
      console.log(`[LogoutAction] Iron-session cookie destroyed for ${loggedOutUsername}.`);
    }
  } catch (e: any) {
    console.error(`[LogoutAction] Error destroying iron-session for ${loggedOutUsername}:`, e);
    logEvent(loggedOutUsername, loggedOutRole, 'LOGOUT_IRON_SESSION_DESTROY_FAILED', 'ERROR', { error: e.message });
    // Still attempt redirect
  }
  
  logEvent(loggedOutUsername, loggedOutRole, 'LOGOUT_SUCCESS', 'INFO');
  if (debugMode) {
    console.log(`[LogoutAction] Redirecting to /login for ${loggedOutUsername}.`);
  }
  redirect('/login'); 
  // This return is for type consistency, redirect will prevent it from being sent
  return { status: "success", message: "Logged out successfully." };
}

