
// src/lib/logger.ts
// REMOVED 'use server'; directive from here

import { loadEncryptedData, saveEncryptedData } from '@/backend/services/storageService';
import type { UserSettingsData } from './user-settings';
import type { PanelSettingsData } from '@/app/(app)/settings/types'; // Use types for global settings

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'AUTH' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  username: string; // User performing the action, or "System"
  role: string;     // Role of the user, or "System"
  action: string;   // e.g., USER_LOGIN_SUCCESS, USER_CREATED, SETTINGS_UPDATED
  details?: object | string; // Additional relevant data
  targetUser?: string; // If action targets another user
  targetRole?: string;   // Role of the target user
  ipAddress?: string; // Optional: if IP logging is desired and obtainable
}

// Placeholder interface, can be expanded if needed
interface PanelLogSettings {
  maxLogFileSizeMB?: number;
  logRotationDays?: number;
}

export const OWNER_LOG_FILE = 'Owner-Logs.json';
export const ADMIN_LOG_FILE = 'Admin-Logs.json';
export const CUSTOM_LOG_FILE = 'Custom-Logs.json';


async function getEffectiveDebugMode(username?: string, role?: string): Promise<boolean> {
  // Attempt to load user-specific debug settings first
  if (username && username !== 'System' && username !== 'UnknownUser' && role && role !== 'System' && role !== 'Unknown') {
    try {
      const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
      const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
      const userSettingsRaw = await loadEncryptedData(settingsFilename) as UserSettingsData | null;
      if (userSettingsRaw && typeof userSettingsRaw.debugMode === 'boolean') {
        // console.log(`[Logger - getEffectiveDebugMode] Using user-specific debugMode (${userSettingsRaw.debugMode}) for ${username}`);
        return userSettingsRaw.debugMode;
      }
    } catch (e) {
       // console.warn(`[Logger - getEffectiveDebugMode] Could not load user-specific settings for ${username}. Error: ${e}`);
    }
  }
  
  // Fallback to global debug settings
  try {
    const globalSettingsRaw = await loadEncryptedData(".settings.json") as PanelSettingsData | null;
    if (globalSettingsRaw && typeof globalSettingsRaw.debugMode === 'boolean') {
      // console.log(`[Logger - getEffectiveDebugMode] Using global debugMode (${globalSettingsRaw.debugMode})`);
      return globalSettingsRaw.debugMode;
    }
  } catch (e) {
    // console.warn(`[Logger - getEffectiveDebugMode] Could not load global panel settings. Error: ${e}`);
  }
  
  // console.log(`[Logger - getEffectiveDebugMode] Defaulting to debugMode: false`);
  return false; // Default if no settings found
}


async function appendToLogFile(filename: string, entry: LogEntry): Promise<void> {
  let logs: LogEntry[] = [];
  try {
    const existingLogs = await loadEncryptedData(filename);
    if (Array.isArray(existingLogs)) {
      logs = existingLogs as LogEntry[];
    } else if (existingLogs !== null) {
      console.warn(`[Logger - appendToLogFile] Log file ${filename} was not an array or was null. Re-initializing.`);
      // logs will remain empty, a new log array will be started
    }
  } catch (e) {
    // This catch is for errors during loadEncryptedData itself, like decryption failure or critical file read issues
    console.warn(`[Logger - appendToLogFile] Could not load log file ${filename} due to an error. Initializing new log. Error:`, e);
  }

  logs.push(entry);
  // Optional: Trim logs if they get too large
  // const MAX_LOG_ENTRIES = 1000; // Example limit
  // if (logs.length > MAX_LOG_ENTRIES) { logs = logs.slice(-MAX_LOG_ENTRIES); }

  try {
    await saveEncryptedData(filename, logs);
  } catch (e) {
    console.error(`[Logger - appendToLogFile] CRITICAL: Failed to save updated log file ${filename}. Error:`, e);
  }
}

export async function logEvent(
  username: string,
  role: string,
  action: string,
  level: LogLevel,
  details?: object | string,
  targetUser?: string,
  targetRole?: string
): Promise<void> {
  const fullLogEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    username,
    role,
    action,
    details,
    targetUser,
    targetRole,
  };

  const effectiveDebugModeForThisEvent = await getEffectiveDebugMode(username, role);

  // Console logging logic
  if (level === 'ERROR' || level === 'AUTH') {
    console.error(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  } else if (level === 'WARN') {
     console.warn(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  } else if (level === 'INFO') {
    // Always log INFO to console, regardless of debug mode, as these are generally important operational logs.
    console.log(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  } else if (level === 'DEBUG' && effectiveDebugModeForThisEvent) {
    console.log(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  }


  // File logging logic
  const fileLoggingPromises: Promise<void>[] = [];

  // Always log to Owner-Logs.json
  fileLoggingPromises.push(appendToLogFile(OWNER_LOG_FILE, fullLogEntry));

  if (role === 'Admin' || role === 'Custom') {
    // If Admin or Custom, also log to Admin-Logs.json
    fileLoggingPromises.push(appendToLogFile(ADMIN_LOG_FILE, fullLogEntry));
  }
  if (role === 'Custom') {
    // If Custom, also log to Custom-Logs.json
    fileLoggingPromises.push(appendToLogFile(CUSTOM_LOG_FILE, fullLogEntry));
  }
  // System and Unknown roles also go to Owner logs only by default via the first push.

  try {
    await Promise.all(fileLoggingPromises);
  } catch (e) {
    // Errors during individual appendToLogFile are already console.error'd there.
    // This catch is for any Promise.all specific issues, though unlikely with current setup.
    console.error("[Logger - logEvent] Error during Promise.all for log file writes:", e);
  }
}
