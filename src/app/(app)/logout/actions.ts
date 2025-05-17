
"use server";

import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger'; // Import logger

export interface LogoutState {
  message: string;
  status: "success" | "error";
}

export async function logout(username?: string, role?: string): Promise<LogoutState> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  
  const loggedOutUsername = username || session.username || 'UnknownUser';
  const loggedOutRole = role || session.role || 'Unknown';

  if (username && role) {
    const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`; // Server-side activity file
    const dataPath = getDataPath();
    const sessionFilePath = path.join(dataPath, sessionFilename);

    try {
      await fs.unlink(sessionFilePath);
      // console.log(`[LogoutAction] Server-side session file ${sessionFilename} deleted.`);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        // console.warn(`[LogoutAction] Server-side session file ${sessionFilename} not found, presumed already deleted.`);
      } else {
        console.error(`[LogoutAction] Error deleting server-side session file ${sessionFilename}:`, e);
      }
    }
  } else if (session.username && session.role) {
    // Fallback if username/role not passed but available in iron-session (less likely with new flow)
    const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
    const dataPath = getDataPath();
    const sessionFilePath = path.join(dataPath, sessionFilename);
     try { await fs.unlink(sessionFilePath); } catch (e) { /* ignore */ }
  }
  
  session.destroy(); // This clears the iron-session cookie
  logEvent(loggedOutUsername, loggedOutRole, 'LOGOUT_SUCCESS', 'INFO');
  redirect('/login'); 
  // This return is for type consistency, redirect will prevent it from being sent
  return { status: "success", message: "Logged out successfully." };
}
