
// src/lib/logger.ts
'use server';

import { loadEncryptedData, saveEncryptedData } from '@/backend/services/storageService';
import { type UserSettingsData } from './user-settings';
import { type PanelSettingsData, loadPanelSettings as loadGlobalPanelSettingsIfAvailable } from '@/app/(app)/settings/actions'; // For global settings

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'AUTH' | 'DEBUG';

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

const OWNER_LOG_FILE = 'Owner-Logs.json';
const ADMIN_LOG_FILE = 'Admin-Logs.json';
const CUSTOM_LOG_FILE = 'Custom-Logs.json';

async function getEffectiveDebugMode(username?: string, role?: string): Promise<boolean> {
  if (username && role && username !== 'System' && username !== 'UnknownUser') {
    try {
      const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
      const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
      const userSettingsData = await loadEncryptedData(settingsFilename) as UserSettingsData | null;
      if (userSettingsData && typeof userSettingsData.debugMode === 'boolean') {
        return userSettingsData.debugMode;
      }
    } catch { /* Fall through */ }
  }
  // Fallback to global settings if user-specific not found or not applicable
  try {
    const globalSettingsResult = await loadGlobalPanelSettingsIfAvailable();
    if (globalSettingsResult.status === 'success' && globalSettingsResult.data) {
      // Global panel settings no longer directly store debugMode.
      // This part can be removed or adapted if global debug makes sense.
      // For now, if user-specific debug isn't on, assume debug is off for logging verbosity.
    }
  } catch { /* ignore */ }
  return false; // Default to false
}


export async function logEvent(
  username: string,
  role: string, // This is the role of the user *performing* the action
  action: string,
  level: LogLevel,
  details?: object | string,
  targetUser?: string,
  targetRole?: string
): Promise<void> {
  
  const effectiveDebugMode = await getEffectiveDebugMode(username, role);

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
        // If file exists but isn't an array (e.g., corrupted), log warning and overwrite.
        console.warn(`[Logger] Log file ${filename} was not an array or was corrupted. Resetting log file.`);
        // Optionally, back up corrupted file before resetting:
        // await saveEncryptedData(`${filename}.corrupted.${Date.now()}.json`, existingLogsRaw);
        logs = []; // Start fresh
      }
      // else if !existingLogsRaw, logs remains an empty array, which is fine for new file

      logs.push(entry);
      await saveEncryptedData(filename, logs); // storageService encrypts and saves

      if (effectiveDebugMode) {
        console.log(`[Logger - Debug] Event logged to ${filename}: Action: ${entry.action}, User: ${entry.username}(${entry.role})`);
      }
    } catch (e) {
      console.error(`[Logger] CRITICAL: Failed to append to log file ${filename}:`, e instanceof Error ? e.message : String(e));
    }
  };

  // Hierarchical logging
  await appendToLogFile(OWNER_LOG_FILE, fullLogEntry);

  if (role === 'Admin') {
    await appendToLogFile(ADMIN_LOG_FILE, fullLogEntry);
  } else if (role === 'Custom') {
    await appendToLogFile(ADMIN_LOG_FILE, fullLogEntry); // Custom logs also go into Admin logs
    await appendToLogFile(CUSTOM_LOG_FILE, fullLogEntry);
  }
  // 'Owner', 'Administrator', 'System', 'Unknown' roles only log to OWNER_LOG_FILE directly.

  // Console logging part
  if (level === 'ERROR' || level === 'AUTH') {
    console.error(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  } else if (effectiveDebugMode || level === 'WARN') { 
     console.log(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  }
}
