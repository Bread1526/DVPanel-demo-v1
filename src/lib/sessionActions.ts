
'use server';
import { type FileSessionData } from '@/lib/session';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // For debug logging
import { getDataPath } from '@/backend/lib/config';
import path from 'path';

interface TouchSessionResponse {
  success: boolean;
  message: string;
}

export async function touchSession(username?: string, role?: string, token?: string): Promise<TouchSessionResponse> {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (debugMode) console.log(`[SessionActions - touchSession] Attempting for user: ${username}, role: ${role}, token: ${token ? 'Present' : 'Missing'}`);

  if (!username || !role || !token) {
    if (debugMode) console.warn('[SessionActions - touchSession] Missing username, role, or token. Cannot update activity.');
    return { success: false, message: 'Missing session identifiers.' };
  }

  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  const dataPath = getDataPath();
  const sessionFilePath = path.join(dataPath, sessionFilename);

  try {
    const sessionFileData = await loadEncryptedData(sessionFilename) as FileSessionData | null;

    if (!sessionFileData) {
      if (debugMode) console.warn(`[SessionActions - touchSession] Session file not found: ${sessionFilename}. Cannot update activity.`);
      return { success: false, message: 'Session file not found.' };
    }

    if (sessionFileData.token !== token) {
      if (debugMode) console.warn(`[SessionActions - touchSession] Token mismatch for user ${username}. Activity not updated.`);
      // Optionally, could delete the session file here if strict token validation is desired on touch
      return { success: false, message: 'Invalid session token.' };
    }

    sessionFileData.lastActivity = Date.now();
    await saveEncryptedData(sessionFilename, sessionFileData);

    if (debugMode) console.log(`[SessionActions - touchSession] Successfully updated lastActivity for user ${username} in ${sessionFilename}.`);
    return { success: true, message: 'Session activity updated.' };

  } catch (error) {
    console.error(`[SessionActions - touchSession] Error updating session activity for ${username}:`, error);
    return { success: false, message: 'Error updating session activity.' };
  }
}
