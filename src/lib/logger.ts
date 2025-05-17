// src/lib/logger.ts
import { loadEncryptedData, saveEncryptedData } from '@/backend/services/storageService';
import type { UserSettingsData } from './user-settings'; // For user debug settings
// import type { PanelSettingsData } from '@/app/(app)/settings/actions'; // For global settings
import { loadPanelSettings as loadGlobalPanelSettingsIfAvailable } from '@/app/(app)/settings/actions';

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

export const OWNER_LOG_FILE = 'Owner-Logs.json';
export const ADMIN_LOG_FILE = 'Admin-Logs.json';
export const CUSTOM_LOG_FILE = 'Custom-Logs.json';

// Placeholder for potential future settings specific to logging behavior, if needed.
export interface PanelLogSettings {
  maxLogFileSize?: number; // e.g., in MB
  logRotation?: boolean;
}


async function getEffectiveDebugMode(username?: string, role?: string): Promise<boolean> {
  // Attempt to load user-specific debugMode first
  if (username && role && username !== 'System' && username !== 'UnknownUser' && username !== 'Unknown') {
    const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
    const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
    try {
      const userSettings = await loadEncryptedData(settingsFilename) as UserSettingsData | null;
      if (userSettings && typeof userSettings.debugMode === 'boolean') {
        // console.log(`[Logger - DebugModeCheck] User ${username} debugMode: ${userSettings.debugMode}`);
        return userSettings.debugMode;
      }
    } catch (e) {
      // console.warn(`[Logger - DebugModeCheck] Could not load user-specific settings for ${username}:`, e);
    }
  }

  // Fallback to global debugMode from .settings.json
  // Note: panelSettingsSchema no longer includes debugMode, so this path may not be relevant
  // for a global debug flag unless it's re-added or sourced differently.
  try {
    const globalSettingsResult = await loadGlobalPanelSettingsIfAvailable();
    if (globalSettingsResult.status === 'success' && globalSettingsResult.data) {
       // if (typeof globalSettingsResult.data.debugMode === 'boolean') {
       //  console.log(`[Logger - DebugModeCheck] Global debugMode: ${globalSettingsResult.data.debugMode}`);
       //  return globalSettingsResult.data.debugMode;
       // }
    }
  } catch (e) {
    // console.warn(`[Logger - DebugModeCheck] Could not load global panel settings:`, e);
  }
  
  // Default to false if no debugMode setting is found anywhere
  // console.log(`[Logger - DebugModeCheck] Defaulting to debugMode: false for user: ${username || 'N/A'}`);
  return false;
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
  
  const effectiveDebugModeForThisEvent = await getEffectiveDebugMode(username, role);

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

  const appendToLogFile = async (filename: string, entry: LogEntry) => {
    try {
      let logs: LogEntry[] = [];
      const existingLogsRaw = await loadEncryptedData(filename);
      
      if (existingLogsRaw && Array.isArray(existingLogsRaw)) {
        logs = existingLogsRaw as LogEntry[];
      } else if (existingLogsRaw) {
        // This case implies the file existed but wasn't an array (corrupted)
        if (effectiveDebugModeForThisEvent) {
            console.warn(`[Logger] Log file ${filename} was not an array or was corrupted. Resetting log file.`);
        }
        logs = []; // Reset to empty array to prevent further errors with this file
      }
      // If existingLogsRaw is null (file didn't exist), logs remains an empty array, which is correct.

      logs.push(entry);
      // Optional: Limit log size, e.g., logs = logs.slice(-1000);
      await saveEncryptedData(filename, logs); 

      if (effectiveDebugModeForThisEvent) {
        console.log(`[Logger - Debug] Event logged to ${filename}: Action: ${entry.action}, User: ${entry.username}(${entry.role})`);
      }
    } catch (e) {
      console.error(`[Logger] CRITICAL: Failed to append to log file ${filename}:`, e instanceof Error ? e.message : String(e));
    }
  };

  // Hierarchical logging
  // All logs go to Owner-Logs.json
  await appendToLogFile(OWNER_LOG_FILE, fullLogEntry);

  if (role === 'Admin') {
    await appendToLogFile(ADMIN_LOG_FILE, fullLogEntry);
  } else if (role === 'Custom') {
    // Custom logs also go into Admin logs for Admin visibility, then into their own.
    await appendToLogFile(ADMIN_LOG_FILE, fullLogEntry); 
    await appendToLogFile(CUSTOM_LOG_FILE, fullLogEntry);
  }
  
  // Console logging part
  const consoleMsg = `[${fullLogEntry.level}] User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`;
  const detailsString = fullLogEntry.details ? (typeof fullLogEntry.details === 'string' ? fullLogEntry.details : JSON.stringify(fullLogEntry.details)) : '';
  const targetString = fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole || 'N/A'})` : '';

  // Always log ERROR and AUTH to console.
  // Log WARN and INFO to console regardless of debug mode for general visibility.
  // Log DEBUG level messages only if effectiveDebugModeForThisEvent is true.
  if (level === 'ERROR' || level === 'AUTH') {
    console.error(`${consoleMsg}`, detailsString, targetString);
  } else if (level === 'WARN' || level === 'INFO') {
     console.log(`${consoleMsg}`, detailsString, targetString);
  } else if (level === 'DEBUG' && effectiveDebugModeForThisEvent) {
     console.log(`${consoleMsg}`, detailsString, targetString);
  }
}
