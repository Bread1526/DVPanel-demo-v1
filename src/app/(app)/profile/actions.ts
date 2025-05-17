
'use server';

import { z } from "zod";
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { hashPassword, verifyPassword, loadUserById, type UserData } from "@/app/(app)/roles/actions";
import { userSettingsSchema, type UserSettingsData } from "@/lib/user-settings";
import { logEvent } from '@/lib/logger';
import { 
  updatePasswordSchema, 
  type UpdatePasswordState, 
  type UpdateUserSettingsState 
} from './types';

// --- Update Password ---
export async function updateUserPassword(prevState: UpdatePasswordState, formData: FormData): Promise<UpdatePasswordState> {
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
        // For owner, if .env.OWNER_PASSWORD is set, it should be the source of truth for current password verification
        isCurrentPasswordValid = currentPassword === process.env.OWNER_PASSWORD;
    } else if (currentUserData.hashedPassword && currentUserData.salt) {
        // For regular users, or owner if .env.OWNER_PASSWORD is not set (relying on their file hash)
        isCurrentPasswordValid = await verifyPassword(currentPassword, currentUserData.hashedPassword, currentUserData.salt);
    } else {
        // Fallback if owner has no .env password and no hash in file (should not happen after first login)
        logEvent(session.username, session.role, 'UPDATE_PASSWORD_NO_HASH_FOR_USER', 'ERROR', { userId: session.userId });
        return { status: "error", message: "Cannot verify current password. User profile incomplete.", errors: { _form: ["User profile issue."] }};
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
    // Determine filename based on whether it's the owner or a regular user
    const userFilename = currentUserData.id === 'owner_root' 
      ? `${safeUsername}-Owner.json` 
      : `${safeUsername}-${safeRole}.json`;
    
    await saveEncryptedData(userFilename, updatedUserData);
    logEvent(session.username, session.role, 'UPDATE_PASSWORD_SUCCESS', 'INFO');
    return { status: "success", message: "Password updated successfully." };

  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    console.error("[UpdateUserPassword] Error:", e);
    logEvent(session.username, session.role, 'UPDATE_PASSWORD_EXCEPTION', 'ERROR', { error: e.message });
    return { status: "error", message: `An unexpected error occurred: ${e.message}`, errors: { _form: [`An unexpected error occurred: ${e.message}`] } };
  }
}

// --- Update User-Specific Settings ---
export async function updateCurrentUserSpecificSettings(prevState: UpdateUserSettingsState, settingsData: UserSettingsData): Promise<UpdateUserSettingsState> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.isLoggedIn || !session.username || !session.role) {
    logEvent('Unknown', 'Unknown', 'UPDATE_USER_SETTINGS_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated." };
  }

  const validatedSettings = userSettingsSchema.safeParse(settingsData);
  if (!validatedSettings.success) {
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

  try {
    await saveEncryptedData(settingsFilename, validatedSettings.data);
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_SUCCESS', 'INFO', { settings: Object.keys(validatedSettings.data) });
    return { status: "success", message: "Your settings have been updated.", data: validatedSettings.data };
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    console.error("[UpdateUserSettings] Error saving settings:", e);
    logEvent(session.username, session.role, 'UPDATE_USER_SETTINGS_EXCEPTION', 'ERROR', { error: e.message });
    return { status: "error", message: `Failed to save settings: ${e.message}` };
  }
}
