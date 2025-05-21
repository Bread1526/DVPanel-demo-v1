// src/app/(app)/profile/actions.ts
"use server";

import { z } from "zod";
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { saveEncryptedData } from "@/backend/services/storageService";
import { hashPassword, verifyPassword, loadUserById, type UserData } from "@/app/(app)/roles/actions";
import { userSettingsSchema, type UserSettingsData } from '@/lib/user-settings';
import { logEvent } from '@/lib/logger';
import { type UpdatePasswordState, updatePasswordSchema, type UpdateUserSettingsState } from './types';
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from 'fs/promises';
import { loadPanelSettings } from '@/app/(app)/settings/actions';


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
  const dataPath = getDataPath();

  try {
    const currentUserData = await loadUserById(session.userId);
    if (!currentUserData) {
      logEvent(session.username, session.role, 'UPDATE_PASSWORD_USER_NOT_FOUND', 'ERROR', { userId: session.userId });
      return { status: "error", message: "User not found.", errors: { _form: ["User not found."] } };
    }

    // Owner password check (if OWNER_PASSWORD is set in .env and current user is owner)
    let isCurrentPasswordValid = false;
    if (currentUserData.id === 'owner_root' && process.env.OWNER_PASSWORD) {
        // For owner, always check against .env password first
        isCurrentPasswordValid = currentPassword === process.env.OWNER_PASSWORD;
        // As a fallback, if .env check fails but a hash exists (e.g. if we allowed UI change for owner, which we don't), check hash
        if (!isCurrentPasswordValid && currentUserData.hashedPassword && currentUserData.salt) {
            isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
        }
    } else if (currentUserData.hashedPassword && currentUserData.salt) { // For non-owner users
        isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
    }


    if (!isCurrentPasswordValid) {
      logEvent(session.username, session.role, 'UPDATE_PASSWORD_INCORRECT_CURRENT', 'WARN');
      return { status: "error", message: "Incorrect current password.", errors: { currentPassword: ["Incorrect current password."] } };
    }

    // Owner password cannot be changed through this UI for now
    if (currentUserData.id === 'owner_root') {
        logEvent(session.username, session.role, 'UPDATE_PASSWORD_OWNER_ATTEMPT_UI', 'WARN');
        return { status: "error", message: "Owner password must be changed via .env.local configuration.", errors: { _form: ["Owner password cannot be changed here."] } };
    }

    const { hash: newHashedPassword, salt: newSalt } = await hashPassword(newPassword);
    
    const updatedUserData: UserData = {
      ...currentUserData,
      hashedPassword: newHashedPassword,
      salt: newSalt,
      updatedAt: new Date().toISOString(),
    };

    const safeUsername = currentUserData.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = currentUserData.role.replace(/[^a-zA-Z0-9]/g, '_');
    const userFilename = `${safeUsername}-${safeRole}.json`;
    const fullPath = path.join(dataPath, userFilename);

    if (currentDebugMode) {
      console.log(`[UpdateUserPassword] Data to save to ${userFilename}:`, JSON.stringify(updatedUserData, null, 2).substring(0, 500) + "...");
      console.log(`[UpdateUserPassword] Full path for saving: ${fullPath}`);
    }
    
    await saveEncryptedData(userFilename, updatedUserData);

    if (currentDebugMode) {
      console.log(`[UpdateUserPassword] Successfully called saveEncryptedData for ${userFilename}. Verifying file existence...`);
      try {
        await fs.stat(fullPath);
        console.log(`[UpdateUserPassword] VERIFIED: File ${userFilename} exists at ${fullPath} after save.`);
      } catch (statError: any) {
        console.error(`[UpdateUserPassword] VERIFICATION FAILED: File ${userFilename} DOES NOT exist at ${fullPath} after save attempt. Error:`, statError.message);
      }
    }

    logEvent(session.username, session.role, 'UPDATE_PASSWORD_SUCCESS', 'INFO');
    return { status: "success", message: "Password updated successfully." };

  } catch (e: any) {
    console.error("[UpdateUserPassword] CRITICAL: Error during password update. Full error object caught:", e);
    console.error("[UpdateUserPassword] Error Name:", e.name);
    console.error("[UpdateUserPassword] Error Message:", e.message);
    console.error("[UpdateUserPassword] Error Stack:", e.stack);
    logEvent(session.username, session.role, 'UPDATE_PASSWORD_EXCEPTION', 'ERROR', { error: e.message });
    
    const clientErrorMessage = `Password update failed. Server Error: ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0,200)}...` : ''}`;
    return { status: "error", message: clientErrorMessage, errors: { _form: [clientErrorMessage] } };
  }
}

export async function updateCurrentUserSpecificSettings(prevState: UpdateUserSettingsState, settingsData: UserSettingsData): Promise<UpdateUserSettingsState> {
  let userSpecificDebugMode = settingsData.debugMode ?? false; // Use the submitted debugMode for this action's own logging

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.isLoggedIn || !session.username || !session.role) {
    logEvent('UnknownUser', 'Unknown', 'UPDATE_USER_SETTINGS_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated." };
  }

  if (userSpecificDebugMode) console.log("[UpdateUserSettings] Received user settings for validation:", settingsData);
  const validatedSettings = userSettingsSchema.safeParse(settingsData);
  if (!validatedSettings.success) {
    if (userSpecificDebugMode) console.error("[UpdateUserSettings] User settings validation failed:", validatedSettings.error.flatten().fieldErrors);
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_VALIDATION_FAILED', 'WARN', { errors: validatedSettings.error.flatten().fieldErrors });
    return {
      status: "error",
      message: "Invalid settings data.",
      errors: validatedSettings.error.flatten().fieldErrors as any, // Cast for simplicity, ensure your UI handles this
    };
  }

  const safeUsername = session.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = session.role.replace(/[^a-zA-Z0-9]/g, '_');
  const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
  const dataPath = getDataPath();
  const fullPath = path.join(dataPath, settingsFilename);

  try {
    if (userSpecificDebugMode) {
        console.log(`[UpdateUserSettings] Data to save to ${settingsFilename}:`, JSON.stringify(validatedSettings.data, null, 2));
        console.log(`[UpdateUserSettings] Full path for saving: ${fullPath}`);
    }
    await saveEncryptedData(settingsFilename, validatedSettings.data);

    if (userSpecificDebugMode) {
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
    console.error("[UpdateUserSettings] CRITICAL: Error saving user settings. Full error object caught:", e);
    console.error("[UpdateUserSettings] Error Name:", e.name);
    console.error("[UpdateUserSettings] Error Message:", e.message);
    console.error("[UpdateUserSettings] Error Stack:", e.stack);
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_EXCEPTION', 'ERROR', { error: e.message, path: fullPath });
    
    const clientErrorMessage = `Failed to save settings. Server Error: ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0,200)}...` : ''}`;
    return { status: "error", message: clientErrorMessage, errors: { _form: [clientErrorMessage] } };
  }
}
