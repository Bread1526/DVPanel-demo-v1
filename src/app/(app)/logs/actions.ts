
'use server';

import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadEncryptedData } from '@/backend/services/storageService';
import { OWNER_LOG_FILE, ADMIN_LOG_FILE, CUSTOM_LOG_FILE, type LogEntry } from '@/lib/logger';
import type { FetchLogsResult } from './types';
import { loadPanelSettings } from '@/app/(app)/settings/actions';

export async function fetchLogsAction(): Promise<FetchLogsResult> {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (debugMode) console.log('[FetchLogsAction] Attempting to fetch logs.');

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    if (!session.isLoggedIn || !session.username || !session.role) {
      if (debugMode) console.warn('[FetchLogsAction] User not logged in or session invalid.');
      return { status: 'unauthorized', error: 'Not authenticated.' };
    }

    let logFileToRead: string;
    const userRole = session.role;

    if (debugMode) console.log(`[FetchLogsAction] Fetching logs for user: ${session.username}, role: ${userRole}`);

    switch (userRole) {
      case 'Owner':
      case 'Administrator':
        logFileToRead = OWNER_LOG_FILE;
        break;
      case 'Admin':
        logFileToRead = ADMIN_LOG_FILE;
        break;
      case 'Custom':
        logFileToRead = CUSTOM_LOG_FILE;
        break;
      default:
        if (debugMode) console.warn(`[FetchLogsAction] Unknown or unsupported role for log viewing: ${userRole}`);
        return { status: 'unauthorized', error: 'Invalid role for log viewing.' };
    }

    if (debugMode) console.log(`[FetchLogsAction] Attempting to read log file: ${logFileToRead}`);

    const logs = await loadEncryptedData(logFileToRead) as LogEntry[] | null;

    if (logs === null) {
      if (debugMode) console.log(`[FetchLogsAction] Log file ${logFileToRead} not found or empty. Returning empty array.`);
      return { status: 'success', logs: [] };
    }

    if (!Array.isArray(logs)) {
      console.error(`[FetchLogsAction] Log file ${logFileToRead} content is not an array. Data:`, logs);
      return { status: 'error', error: 'Log data is corrupted.' };
    }
    
    if (debugMode) console.log(`[FetchLogsAction] Successfully loaded ${logs.length} log entries from ${logFileToRead}.`);
    return { status: 'success', logs: logs as LogEntry[] };

  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    console.error('[FetchLogsAction] Error fetching logs:', e);
    return { status: 'error', error: `Failed to fetch logs: ${e.message}` };
  }
}
