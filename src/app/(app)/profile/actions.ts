
"use server";

import { z } from "zod";
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { hashPassword, verifyPassword, loadUserById, type UserData } from "@/app/(app)/roles/actions";
import { userSettingsSchema, type UserSettingsData } from '@/lib/user-settings';
import { logEvent } from '@/lib/logger';
import { type UpdatePasswordState, updatePasswordSchema, type UpdateUserSettingsState } from './types';
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from 'fs/promises';
import { loadPanelSettings } from '@/app/(app)/settings/actions';


export async function updateUserPassword(prevState: UpdatePasswordState, formData: FormData): Promise<UpdatePasswordState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    logEvent('Unknown', 'Unknown', 'UPDATE_PASSWORD_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated.", errors: { _form: ["Authentication required."] } };
  }

  const rawData = {
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmNewPassword: String(formData.get("confirmNewPassword") ?? ""),
  };

  const validatedFields = updatePasswordSchema.safeParse(rawData);
  if (!validatedFields.success) {
    if (debugMode) console.log("[UpdateUserPassword] Validation failed:", validatedFields.error.flatten().fieldErrors);
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

    let isCurrentPasswordValid = false;
    if (currentUserData.id === 'owner_root' && process.env.OWNER_PASSWORD) {
        isCurrentPasswordValid = currentPassword === process.env.OWNER_PASSWORD;
        if (!isCurrentPasswordValid && currentUserData.hashedPassword && currentUserData.salt) {
             // Fallback to checking stored hash for owner if .env direct check fails (e.g., if owner changed their password via UI before, which isn't a feature yet but for robustness)
            isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
        }
    } else if (currentUserData.hashedPassword && currentUserData.salt) {
        isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
    }


    if (!isCurrentPasswordValid) {
      logEvent(session.username, session.role, 'UPDATE_PASSWORD_INCORRECT_CURRENT', 'WARN');
      return { status: "error", message: "Incorrect current password.", errors: { currentPassword: ["Incorrect current password."] } };
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

    if (debugMode) {
      console.log(`[UpdateUserPassword] Data to save to ${userFilename}:`, JSON.stringify(updatedUserData, null, 2).substring(0, 500) + "...");
      console.log(`[UpdateUserPassword] Full path for saving: ${fullPath}`);
    }
    
    await saveEncryptedData(userFilename, updatedUserData);

    if (debugMode) {
      try {
        await fs.stat(fullPath);
        console.log(`[UpdateUserPassword] VERIFIED: File ${userFilename} exists at ${fullPath} after save.`);
      } catch (statError) {
        console.error(`[UpdateUserPassword] VERIFICATION FAILED: File ${userFilename} DOES NOT exist at ${fullPath} after save attempt. Error:`, statError);
      }
      console.log(`[UpdateUserPassword] Call to saveEncryptedData for ${userFilename} completed.`);
    }

    logEvent(session.username, session.role, 'UPDATE_PASSWORD_SUCCESS', 'INFO');
    return { status: "success", message: "Password updated successfully." };

  } catch (e: any) {
    console.error("[UpdateUserPassword] Error:", e);
    logEvent(session.username, session.role, 'UPDATE_PASSWORD_EXCEPTION', 'ERROR', { error: e.message });
    // Send detailed error message to client
    const clientErrorMessage = `Password update failed. Server Error: ${e.message || String(e)}`;
    return { status: "error", message: clientErrorMessage, errors: { _form: [clientErrorMessage] } };
  }
}

export async function updateCurrentUserSpecificSettings(prevState: UpdateUserSettingsState, settingsData: UserSettingsData): Promise<UpdateUserSettingsState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.isLoggedIn || !session.username || !session.role) {
    logEvent('Unknown', 'Unknown', 'UPDATE_USER_SETTINGS_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated." };
  }

  if (debugMode) console.log("[UpdateUserSettings] Received user settings for validation:", settingsData);
  const validatedSettings = userSettingsSchema.safeParse(settingsData);
  if (!validatedSettings.success) {
    if (debugMode) console.error("[UpdateUserSettings] User settings validation failed:", validatedSettings.error.flatten().fieldErrors);
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
    if (debugMode) {
        console.log(`[UpdateUserSettings] Attempting to save user-specific settings to ${settingsFilename}:`, JSON.stringify(validatedSettings.data, null, 2));
        console.log(`[UpdateUserSettings] Full path for saving: ${fullPath}`);
    }
    await saveEncryptedData(settingsFilename, validatedSettings.data);

    if (debugMode) {
      try {
        await fs.stat(fullPath);
        console.log(`[UpdateUserSettings] VERIFIED: File ${settingsFilename} exists at ${fullPath} after save.`);
      } catch (statError) {
        console.error(`[UpdateUserSettings] VERIFICATION FAILED: File ${settingsFilename} DOES NOT exist at ${fullPath} after save attempt. Error:`, statError);
      }
      console.log(`[UpdateUserSettings] Successfully saved user-specific settings for ${session.username} to ${settingsFilename}`);
    }
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_SUCCESS', 'INFO', { settings: Object.keys(validatedSettings.data) });
    return { status: "success", message: "Your settings have been updated.", data: validatedSettings.data };
  } catch (e: any) {
    console.error("[UpdateUserSettings] Error saving user settings to", fullPath, ":", e);
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_EXCEPTION', 'ERROR', { error: e.message, path: fullPath });
    // Send detailed error message to client
    const clientErrorMessage = `Failed to save settings. Server Error: ${e.message || String(e)}`;
    return { status: "error", message: clientErrorMessage, errors: { _form: [clientErrorMessage] } };
  }
}
