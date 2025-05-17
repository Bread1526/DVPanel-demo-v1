
// src/lib/logger.ts
'use server'; // Or remove if only used by other server files

import { loadEncryptedData } from '@/backend/services/storageService';
import { type UserSettingsData } from './user-settings';
import { type PanelSettingsData } from '@/app/(app)/settings/actions'; // For global settings

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

// Placeholder for actual file/database logging.
// For now, it logs to console, respecting user's debugMode if available,
// or a global debugMode from panel settings.
export async function logEvent(
  username: string,
  role: string,
  action: string,
  level: LogLevel,
  details?: object | string,
  targetUser?: string,
  targetRole?: string
): Promise<void> {
  const logEntry: Omit<LogEntry, 'timestamp'> = {
    level,
    username,
    role,
    action,
    details,
    targetUser,
    targetRole,
  };

  // Attempt to load user-specific debug settings if username and role are provided
  let userSpecificDebugMode = false;
  if (username !== 'System' && username !== 'UnknownUser' && role !== 'Unknown') {
    try {
      const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
      const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
      const userSettingsRaw = await loadEncryptedData(settingsFilename) as UserSettingsData | null;
      if (userSettingsRaw && typeof userSettingsRaw.debugMode === 'boolean') {
        userSpecificDebugMode = userSettingsRaw.debugMode;
      }
    } catch (e) {
      // Ignore if user settings can't be loaded for logging
    }
  }
  
  // Attempt to load global debug settings as a fallback
  let globalDebugMode = false;
  try {
    const globalSettingsRaw = await loadEncryptedData(".settings.json") as PanelSettingsData | null;
    // Global settings no longer has debugMode. This part can be removed or adapted if needed.
    // For now, let's assume debug is off if not user-specifically on.
  } catch (e) {
    // ignore
  }

  const effectiveDebugMode = userSpecificDebugMode || globalDebugMode;

  const fullLogEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...logEntry,
  };

  if (level === 'ERROR' || level === 'AUTH') {
    console.error(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  } else if (effectiveDebugMode || level === 'WARN') { // Show WARN always, INFO/DEBUG if debug mode
     console.log(`[${fullLogEntry.level}] ${fullLogEntry.timestamp} User: ${fullLogEntry.username}(${fullLogEntry.role}) Action: ${fullLogEntry.action}`, fullLogEntry.details || '', fullLogEntry.targetUser ? `Target: ${fullLogEntry.targetUser}(${fullLogEntry.targetRole})` : '');
  }

  // TODO: Implement actual file/database saving for logs
  // For example:
  // const logFilePath = path.join(getDataPath(), 'activity.log.jsonl');
  // fs.appendFileSync(logFilePath, JSON.stringify(fullLogEntry) + '\n');
}
