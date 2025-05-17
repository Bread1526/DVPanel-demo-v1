
'use server';

import type { SessionData } from '@/lib/session';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';
import { loadEncryptedData } from '@/backend/services/storageService';
import type { LogEntry } from '@/lib/logger';
import { OWNER_LOG_FILE, ADMIN_LOG_FILE, CUSTOM_LOG_FILE, type PanelLogSettings } from '@/lib/logger';
import type { FetchLogsResult } from './types';

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
      logFileToRead = CUSTOM_LOG_FILE; 
      canAccess = true; 
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
      return { logs: loadedData as LogEntry[], status: 'success' };
    } else if (loadedData === null) {
      return { logs: [], status: 'success' };
    } else {
      console.error(`[FetchLogsAction] Log file ${logFileToRead} is corrupted or not an array.`);
      return { error: `Log file ${logFileToRead} is corrupted.`, status: 'error' };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    console.error(`[FetchLogsAction] Error loading log file ${logFileToRead}:`, e);
    return { error: `Failed to load logs: ${e.message}`, status: 'error' };
  }
}
