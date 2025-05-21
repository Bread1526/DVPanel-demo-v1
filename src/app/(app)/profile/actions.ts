
// src/app/(app)/profile/actions.ts
"use server";

import { z } from "zod";
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { hashPassword, verifyPassword, loadUserById, type UserData, updateUser as updateUserCoreDetails } from "@/app/(app)/roles/actions";
import { logEvent } from '@/lib/logger';
import { type UpdatePasswordState, updatePasswordSchema, type UpdateUserSettingsState } from './types';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // For debug mode
import { saveEncryptedData } from '@/backend/services/storageService'; // For user-specific settings
import { userSettingsSchema, type UserSettingsData, defaultUserSettings } from '@/lib/user-settings'; // For user-specific settings structure
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from 'fs/promises';

export async function updateUserPassword(prevState: UpdatePasswordState, formData: FormData): Promise<UpdatePasswordState> {
  let currentDebugMode = false;
  try {
    const panelGlobalSettingsResult = await loadPanelSettings();
    currentDebugMode = panelGlobalSettingsResult.data?.debugMode ?? false;
  } catch { /* ignore, debugMode remains false */ }

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    logEvent('UnknownUser', 'Unknown', 'UPDATE_PASSWORD_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated.", errors: { _form: ["Authentication required."] } };
  }

  const rawData = {
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmNewPassword: String(formData.get("confirmNewPassword") ?? ""),
  };

  const validatedFields = updatePasswordSchema.safeParse(rawData);
  if (!validatedFields.success) {
    if (currentDebugMode) console.log("[UpdateUserPassword] Validation failed:", validatedFields.error.flatten().fieldErrors);
    logEvent(session.username, session.role, 'UPDATE_PASSWORD_VALIDATION_FAILED', 'WARN', { errors: validatedFields.error.flatten().fieldErrors });
    return {
      status: "error",
      message: "Validation failed. Please check the fields.",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { currentPassword, newPassword } = validatedFields.data;

  try {
    const currentUserData = await loadUserById(session.userId);
    if (!currentUserData) {
      logEvent(session.username, session.role, 'UPDATE_PASSWORD_USER_NOT_FOUND', 'ERROR', { userId: session.userId });
      return { status: "error", message: "User not found.", errors: { _form: ["User not found."] } };
    }

    let isCurrentPasswordValid = false;
    if (currentUserData.id === 'owner_root' && process.env.OWNER_PASSWORD) {
        isCurrentPasswordValid = currentPassword === process.env.OWNER_PASSWORD;
        if (!isCurrentPasswordValid && currentUserData.hashedPassword && currentUserData.salt) {
            isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
        }
    } else if (currentUserData.hashedPassword && currentUserData.salt) {
        isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
    }


    if (!isCurrentPasswordValid) {
      logEvent(session.username, session.role, 'UPDATE_PASSWORD_INCORRECT_CURRENT', 'WARN');
      return { status: "error", message: "Incorrect current password.", errors: { currentPassword: ["Incorrect current password."] } };
    }

    if (currentUserData.id === 'owner_root') {
        logEvent(session.username, session.role, 'UPDATE_PASSWORD_OWNER_ATTEMPT_UI', 'WARN');
        return { status: "error", message: "Owner password must be changed via .env.local configuration.", errors: { _form: ["Owner password cannot be changed here."] } };
    }
    
    const userUpdatesForCore = {
      id: currentUserData.id,
      username: currentUserData.username, 
      role: currentUserData.role,
      projects: currentUserData.projects,
      assignedPages: currentUserData.assignedPages,
      allowedSettingsPages: currentUserData.allowedSettingsPages,
      status: currentUserData.status,
      password: newPassword, 
    };

    if (currentDebugMode) {
      console.log(`[UpdateUserPassword] Calling updateUserCoreDetails for user ID ${currentUserData.id} with password update.`);
    }
    
    const updateResult = await updateUserCoreDetails(
      { message: "", status: "idle"}, 
      userUpdatesForCore
    );

    if (updateResult.status === 'error') {
      logEvent(session.username, session.role, 'UPDATE_PASSWORD_CORE_UPDATE_FAILED', 'ERROR', { error: updateResult.message, errors: updateResult.errors });
      return { 
        status: "error", 
        message: updateResult.message || "Failed to update user details.", 
        errors: updateResult.errors || { _form: ["Core user update failed."] }
      };
    }

    logEvent(session.username, session.role, 'UPDATE_PASSWORD_SUCCESS', 'INFO');
    return { status: "success", message: "Password updated successfully." };

  } catch (e: any) {
    console.error("[UpdateUserPassword] CRITICAL: Error during password update:", e);
    let clientErrorMessage = "Password update failed due to a server error.";
    clientErrorMessage = `Password update failed. Server Error: ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0,200)}...` : ''}`;
    
    logEvent(session.username, session.role, 'UPDATE_PASSWORD_EXCEPTION', 'ERROR', { error: e.message });
    return { status: "error", message: clientErrorMessage, errors: { _form: [clientErrorMessage] } };
  }
}


export async function updateCurrentUserSpecificSettings(prevState: UpdateUserSettingsState, settingsData: UserSettingsData): Promise<UpdateUserSettingsState> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.isLoggedIn || !session.username || !session.role) {
    logEvent('UnknownUser', 'Unknown', 'UPDATE_USER_SETTINGS_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated." };
  }
  
  // Determine debug mode for this action's logging from global settings
  let currentGlobalDebugMode = false;
  try {
    const panelGlobalSettingsResult = await loadPanelSettings();
    currentGlobalDebugMode = panelGlobalSettingsResult.data?.debugMode ?? false;
  } catch { /* ignore */ }


  if (currentGlobalDebugMode) console.log("[UpdateUserSettings] Received user settings for validation:", settingsData);
  const validatedSettings = userSettingsSchema.safeParse(settingsData);
  if (!validatedSettings.success) {
    if (currentGlobalDebugMode) console.error("[UpdateUserSettings] User settings validation failed:", validatedSettings.error.flatten().fieldErrors);
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_VALIDATION_FAILED', 'WARN', { errors: validatedSettings.error.flatten().fieldErrors });
    return {
      status: "error",
      message: "Invalid settings data.",
      errors: validatedSettings.error.flatten().fieldErrors as any,
    };
  }

  const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
  const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
  const dataPath = getDataPath();
  const fullPath = path.join(dataPath, settingsFilename);

  try {
    if (currentGlobalDebugMode) {
        console.log(`[UpdateUserSettings] Attempting to save user-specific settings to ${settingsFilename}:`, JSON.stringify(validatedSettings.data, null, 2));
        console.log(`[UpdateUserSettings] Full path for saving: ${fullPath}`);
    }
    await saveEncryptedData(settingsFilename, validatedSettings.data);

    if (currentGlobalDebugMode) {
      console.log(`[UpdateUserSettings] Successfully called saveEncryptedData for ${settingsFilename}. Verifying file existence...`);
      try {
        await fs.stat(fullPath);
        console.log(`[UpdateUserSettings] VERIFIED: File ${settingsFilename} exists at ${fullPath} after save.`);
      } catch (statError: any) {
        console.error(`[UpdateUserSettings] VERIFICATION FAILED: File ${settingsFilename} DOES NOT exist at ${fullPath} after save attempt. Error:`, statError.message);
      }
    }
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_SUCCESS', 'INFO', { settings: Object.keys(validatedSettings.data) });
    return { status: "success", message: "Your settings have been updated.", data: validatedSettings.data };
  } catch (e: any) {
    console.error("[UpdateUserSettings] CRITICAL: Error saving user settings:", e);
    let clientErrorMessage = "Failed to save settings due to a server error.";
    clientErrorMessage = `Failed to save settings. Server Error: ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0,200)}...` : ''}`;
    
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_EXCEPTION', 'ERROR', { error: e.message, path: fullPath });
    return { status: "error", message: clientErrorMessage, errors: { _form: [clientErrorMessage] } };
  }
}
