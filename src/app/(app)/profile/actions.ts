
"use server";

import { z } from "zod";
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { hashPassword, verifyPassword, loadUserById, type UserData } from "@/app/(app)/roles/actions";
import { userSettingsSchema, type UserSettingsData } from "@/lib/user-settings";
import { logEvent } from '@/lib/logger'; // Import logger

// --- Update Password ---
const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "New password must be at least 8 characters long."),
  confirmNewPassword: z.string(),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match.",
  path: ["confirmNewPassword"],
});

export interface UpdatePasswordState {
  message: string;
  status: "idle" | "success" | "error";
  errors?: Partial<Record<keyof z.infer<typeof updatePasswordSchema> | "_form", string[]>>;
}

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

    // For owner, verify against .env password if that's the master, or their file's hash
    let isCurrentPasswordValid = false;
    if (currentUserData.id === 'owner_root' && process.env.OWNER_PASSWORD) {
        isCurrentPasswordValid = currentPassword === process.env.OWNER_PASSWORD;
    } else {
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
export interface UpdateUserSettingsState {
  message: string;
  status: "idle" | "success" | "error";
  errors?: Partial<Record<keyof UserSettingsData | "_form", string[]>>;
  data?: UserSettingsData;
}

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
      errors: validatedSettings.error.flatten().fieldErrors as any, // Cast for nested popup errors
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
