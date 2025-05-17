
'use server';

import type { SessionData } from '@/lib/session';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';
import { loadEncryptedData } from '@/backend/services/storageService';
import type { LogEntry } from '@/lib/logger';
import { OWNER_LOG_FILE, ADMIN_LOG_FILE, CUSTOM_LOG_FILE, PanelLogSettings } from '@/lib/logger'; // Assuming PanelLogSettings might be useful later

export interface FetchLogsResult {
  logs?: LogEntry[];
  error?: string;
  status: 'success' | 'error' | 'unauthorized';
}

export async function fetchLogsAction(): Promise<FetchLogsResult> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.role) {
    return { error: 'Not authenticated.', status: 'unauthorized' };
  }

  let logFileToRead: string;
  let canAccess = false;

  switch (session.role) {
    case 'Owner':
    case 'Administrator':
      logFileToRead = OWNER_LOG_FILE;
      canAccess = true;
      break;
    case 'Admin':
      logFileToRead = ADMIN_LOG_FILE;
      canAccess = true;
      break;
    case 'Custom':
      // Custom roles need specific permission for logs page, checked by AppShell.
      // Here, we assume if they reach this action via the page, they have basic access.
      // The logger already ensures they only write to appropriate files.
      // This action fetches the log file they are designated to see.
      logFileToRead = CUSTOM_LOG_FILE; 
      canAccess = true; // This might need refinement based on specific "view logs" permission
      break;
    default:
      return { error: 'You do not have permission to view these logs.', status: 'unauthorized' };
  }
  
  if (!canAccess) {
     return { error: 'You do not have permission to view these logs.', status: 'unauthorized' };
  }

  try {
    const loadedData = await loadEncryptedData(logFileToRead);
    if (loadedData && Array.isArray(loadedData)) {
      // For now, return all logs. Consider pagination/limiting for large log files.
      // Example: return (loadedData as LogEntry[]).slice(-100); // last 100 entries
      return { logs: loadedData as LogEntry[], status: 'success' };
    } else if (loadedData === null) {
      // File not found, which is fine, means no logs yet for this level
      return { logs: [], status: 'success' };
    } else {
      // File exists but is not an array (corrupted)
      console.error(`[FetchLogsAction] Log file ${logFileToRead} is corrupted or not an array.`);
      return { error: `Log file ${logFileToRead} is corrupted.`, status: 'error' };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    console.error(`[FetchLogsAction] Error loading log file ${logFileToRead}:`, e);
    return { error: `Failed to load logs: ${e.message}`, status: 'error' };
  }
}
