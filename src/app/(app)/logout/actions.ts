
"use server";

import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getDataPath } from '@/backend/lib/config';
import path from 'path';
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger'; // Import logger
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // For debug logging

export interface LogoutState {
  message: string;
  status: "success" | "error";
}

export async function logout(): Promise<LogoutState> { // Removed username and role parameters
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  
  const loggedOutUsername = session.username || 'UnknownUser';
  const loggedOutRole = session.role || 'Unknown';

  if (session.username && session.role) {
    const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`; // Server-side session file
    const dataPath = getDataPath();
    const sessionFilePath = path.join(dataPath, sessionFilename);

    try {
      await fs.unlink(sessionFilePath);
      if (debugMode) console.log(`[LogoutAction] Server-side session file ${sessionFilename} deleted for ${loggedOutUsername}.`);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        if (debugMode) console.warn(`[LogoutAction] Server-side session file ${sessionFilename} not found for ${loggedOutUsername}, presumed already deleted or not created.`);
      } else {
        console.error(`[LogoutAction] Error deleting server-side session file ${sessionFilename} for ${loggedOutUsername}:`, e);
         // Optionally, log this error but proceed with cookie destruction
      }
    }
  } else {
     if (debugMode) console.warn(`[LogoutAction] No username/role found in iron-session; cannot delete specific Auth.json file.`);
  }
  
  session.destroy(); // This clears the iron-session cookie
  logEvent(loggedOutUsername, loggedOutRole, 'LOGOUT_SUCCESS', 'INFO');
  if (debugMode) console.log(`[LogoutAction] User ${loggedOutUsername} logged out successfully, redirecting to /login.`);
  redirect('/login'); 
  
  // This return is for type consistency, redirect will prevent it from being sent
  return { status: "success", message: "Logged out successfully." };
}
