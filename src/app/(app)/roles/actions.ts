
'use server';

import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs/promises';
import type { PanelSettingsData } from '@/app/(app)/settings/types'; 
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { logEvent } from '@/lib/logger';
import { type UserSettingsData, defaultUserSettings } from '@/lib/user-settings';
import {
  type UserData,
  type AddUserInput,
  type UpdateUserInput,
  type UserInput,
  type LoadUsersState,
  type UserActionState,
  userSchema,
  addUserInputSchema,
  updateUserInputSchema
} from './types';

// --- Password Utilities ---
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      resolve({ hash: derivedKey.toString("hex"), salt });
    });
  });
}

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString("hex") === storedHash);
    });
  });
}

// --- Helper Functions ---
function getUserFilePath(username: string, role: UserData["role"]): string {
  const dataPath = getDataPath();
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_'); 
  const filename = `${safeUsername}-${safeRole}.json`;
  return path.join(dataPath, filename);
}

async function getPanelSettingsForDebug(): Promise<PanelSettingsData | null> {
    try {
        const settingsResult = await loadPanelSettings();
        return settingsResult.data || null;
    } catch {
        return null;
    }
}

// --- Owner File Management ---
export async function ensureOwnerFileExists(ownerUsernameEnv: string, ownerPasswordEnv: string, panelSettings?: PanelSettingsData | null): Promise<UserData> {
  const debugMode = panelSettings?.debugMode ?? false;
  const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ownerFilename = `${safeOwnerUsername}-Owner.json`;
  const ownerFilePath = path.join(getDataPath(), ownerFilename);
  const now = new Date().toISOString();
  let existingOwnerData: Partial<UserData> = {};

  if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Ensuring owner file for: ${ownerUsernameEnv}, path: ${ownerFilePath}`);

  try {
    const loadedStat = await fs.stat(ownerFilePath).catch(() => null);
    if (loadedStat && loadedStat.isFile()) {
      const loaded = await loadEncryptedData(ownerFilename);
      if (loaded && typeof loaded === 'object' && loaded !== null) {
        existingOwnerData = loaded as UserData;
        if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Loaded existing owner file. Preserving createdAt: ${existingOwnerData.createdAt}`);
      } else if (debugMode) {
        console.log(`[RolesActions - ensureOwnerFileExists] Owner file ${ownerFilename} exists but is empty or invalid. Will create anew.`);
      }
    }
  } catch (e: any) {
    console.error(`[RolesActions - ensureOwnerFileExists] Error loading existing owner file ${ownerFilename}, will create anew:`, e.message);
  }
  
  let newHashedPassword, newSalt;
  try {
    const hashResult = await hashPassword(ownerPasswordEnv);
    newHashedPassword = hashResult.hash;
    newSalt = hashResult.salt;
  } catch (hashError: any) {
    const errorMessage = `CRITICAL: Failed to hash owner password for ${ownerUsernameEnv}: ${hashError.message}`;
    console.error(`[RolesActions - ensureOwnerFileExists] ${errorMessage}`);
    logEvent('System', 'System', 'OWNER_PASSWORD_HASH_FAILED', 'ERROR', { username: ownerUsernameEnv, error: hashError.message });
    throw new Error(errorMessage);
  }

  const ownerData: UserData = {
    id: 'owner_root',
    username: ownerUsernameEnv,
    hashedPassword: newHashedPassword,
    salt: newSalt,
    role: 'Owner',
    projects: [], 
    assignedPages: [], 
    allowedSettingsPages: [], 
    status: 'Active',
    createdAt: existingOwnerData.createdAt || now,
    updatedAt: now,
    lastLogin: now, 
  };

  try {
    if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Preparing to save owner data to ${ownerFilename}:`, {id: ownerData.id, username: ownerData.username, role: ownerData.role});
    await saveEncryptedData(ownerFilename, ownerData);
    if (debugMode) {
        console.log(`[RolesActions - ensureOwnerFileExists] Successfully called saveEncryptedData for ${ownerFilename}.`);
        const savedStat = await fs.stat(ownerFilePath).catch(() => null);
        if (savedStat && savedStat.isFile()) {
            console.log(`[RolesActions - ensureOwnerFileExists] VERIFIED: Owner file ${ownerFilename} exists at ${ownerFilePath} after save.`);
        } else {
            const verificationError = `CRITICAL VERIFICATION FAILURE: Owner file ${ownerFilename} DOES NOT EXIST at ${ownerFilePath} after save.`;
            console.error(`[RolesActions - ensureOwnerFileExists] ${verificationError}`);
            throw new Error(verificationError);
        }
    }
    return ownerData;
  } catch (e: any) {
    const saveErrorMessage = `Failed to save owner file ${ownerFilename}: ${e.message}`;
    console.error(`[RolesActions - ensureOwnerFileExists] CRITICAL: ${saveErrorMessage}`, e.stack);
    logEvent('System', 'System', 'OWNER_FILE_SAVE_FAILED', 'ERROR', { username: ownerUsernameEnv, error: e.message });
    throw new Error(saveErrorMessage);
  }
}


// --- User CRUD Operations ---
export async function loadUsers(): Promise<LoadUsersState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  
  if (debugMode) console.log("[RolesActions - loadUsers] Attempting to load users...");

  const dataPath = getDataPath();
  const users: UserData[] = [];
  let files: string[];

  try {
    files = await fs.readdir(dataPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      if (debugMode) console.log("[RolesActions - loadUsers] Data directory not found. Returning empty list.");
      return { users: [], status: "success" };
    }
    console.error("[RolesActions - loadUsers] Error reading data directory:", e);
    return { error: "Failed to read user data directory.", status: "error" };
  }

  for (const file of files) {
    if (file.endsWith('.json') && 
        file !== '.settings.json' &&
        !file.endsWith('-Auth.json') &&
        !file.endsWith('-settings.json')) { 
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData && typeof fileData === 'object' && fileData !== null) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            if (parsedUser.data.id !== 'owner_root') { // Explicitly filter out owner from this general load
              users.push(parsedUser.data);
            }
          } else {
            if (debugMode) console.warn(`[RolesActions - loadUsers] Failed to parse user file ${file}:`, parsedUser.error.flatten().fieldErrors);
          }
        }
      } catch (e: any) {
        console.error(`[RolesActions - loadUsers] Error loading or decrypting user file ${file}:`, e.message);
      }
    }
  }
  if (debugMode) console.log(`[RolesActions - loadUsers] Successfully loaded ${users.length} non-owner users.`);
  return { users, status: "success" };
}

export async function loadUserById(userId: string): Promise<UserData | null> {
    const panelSettings = await getPanelSettingsForDebug();
    const debugMode = panelSettings?.debugMode ?? false;
    const dataPath = getDataPath();

    if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load user by ID: ${userId}`);

    if (userId === 'owner_root') {
        const ownerUsernameEnv = process.env.OWNER_USERNAME;
        if (!ownerUsernameEnv) {
            if (debugMode) console.error("[RolesActions - loadUserById] OWNER_USERNAME not set, cannot load 'owner_root'.");
            return null;
        }
        const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const ownerFilename = `${safeOwnerUsername}-Owner.json`;
        if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load owner_root from file: ${ownerFilename} at path: ${path.join(dataPath, ownerFilename)}`);
        try {
            const fileData = await loadEncryptedData(ownerFilename);
            if (fileData && typeof fileData === 'object' && fileData !== null) {
                const parsedUser = userSchema.safeParse(fileData);
                if (parsedUser.success && parsedUser.data.id === 'owner_root') {
                    if (debugMode) console.log(`[RolesActions - loadUserById] Successfully loaded owner_root from ${ownerFilename}`);
                    return parsedUser.data;
                } else {
                     if (debugMode) {
                        console.warn(`[RolesActions - loadUserById] Parsed owner file ${ownerFilename} but ID mismatch or invalid data. User ID in file: ${parsedUser.success ? parsedUser.data.id : 'N/A'}. Schema errors:`, parsedUser.success ? 'N/A' : parsedUser.error.flatten().fieldErrors);
                     }
                }
            } else if (debugMode) {
                console.log(`[RolesActions - loadUserById] Owner file ${ownerFilename} not found or empty.`);
            }
        } catch (e: any) {
            console.error(`[RolesActions - loadUserById] Error loading owner file ${ownerFilename}:`, e.message);
        }
        if (debugMode) console.log(`[RolesActions - loadUserById] Failed to load owner_root from file ${ownerFilename}. This might be expected if owner has not logged in yet via .env credentials.`);
        return null;
    }

    // Logic for regular users
    let files: string[];
    try {
        files = await fs.readdir(dataPath);
    } catch(e: any) {
        if (debugMode) console.warn(`[RolesActions - loadUserById] Error reading data directory for user ID ${userId}:`, e.message);
        return null;
    }

    for (const file of files) {
        if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json') && !file.endsWith('-settings.json') && !file.endsWith('-Owner.json')) { // Ensure we don't accidentally re-parse owner here
            try {
                const fileData = await loadEncryptedData(file);
                if (fileData && typeof fileData === 'object' && fileData !== null) {
                    const parsedUser = userSchema.safeParse(fileData);
                    if (parsedUser.success && parsedUser.data.id === userId) {
                        if (debugMode) console.log(`[RolesActions - loadUserById] Found user ID ${userId} in file ${file}`);
                        return parsedUser.data;
                    }
                }
            } catch (e: any) {
                 if (debugMode) console.warn(`[RolesActions - loadUserById] Error processing file ${file} for user ID ${userId}:`, e.message);
            }
        }
    }

    if (debugMode) console.log(`[RolesActions - loadUserById] User ID ${userId} not found in any regular user file.`);
    return null;
}

export async function addUser(prevState: UserActionState, userInput: AddUserInput): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  const now = new Date().toISOString();

  if (debugMode) console.log("[RolesActions - addUser] Attempting to add user:", userInput.username);

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  if (ownerUsernameEnv && userInput.username === ownerUsernameEnv) {
    logEvent(userInput.username, userInput.role, 'ADD_USER_FAILED_IS_OWNER_USERNAME', 'WARN', { targetUser: userInput.username });
    return { status: "error", message: "This username is reserved for the Owner account.", errors: { username: ["This username is reserved."] } };
  }

  const validatedFields = addUserInputSchema.safeParse(userInput);
  if (!validatedFields.success) {
    if (debugMode) console.error("[RolesActions - addUser] Validation failed:", validatedFields.error.flatten().fieldErrors);
    logEvent(userInput.username, userInput.role, 'ADD_USER_VALIDATION_FAILED', 'WARN', { targetUser: userInput.username, errors: validatedFields.error.flatten().fieldErrors });
    return { status: "error", message: "Validation failed. Please check the fields.", errors: validatedFields.error.flatten().fieldErrors };
  }
  const { password, ...userDataToStore } = validatedFields.data;

  try {
    const usersResult = await loadUsers(); // This loads all non-owner users
    if (usersResult.users && usersResult.users.some(u => u.username === userDataToStore.username)) {
      logEvent(userDataToStore.username, userDataToStore.role, 'ADD_USER_FAILED_USERNAME_EXISTS', 'WARN', { targetUser: userDataToStore.username });
      return { status: "error", message: "Username already exists.", errors: { username: ["Username already taken"] } };
    }

    const { hash: hashedPassword, salt } = await hashPassword(password);
    const newUser: UserData = {
      id: uuidv4(),
      username: userDataToStore.username,
      role: userDataToStore.role,
      hashedPassword,
      salt,
      projects: userDataToStore.projects || [],
      assignedPages: userDataToStore.assignedPages || [],
      allowedSettingsPages: userDataToStore.allowedSettingsPages || [],
      status: userDataToStore.status || 'Active',
      createdAt: now,
      updatedAt: now,
    };

    const filename = path.basename(getUserFilePath(newUser.username, newUser.role));
    await saveEncryptedData(filename, newUser);
    
    const safeUsernameForSettings = newUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRoleForSettings = newUser.role.replace(/[^a-zA-Z0-9]/g, '_');
    const settingsFilename = `${safeUsernameForSettings}-${safeRoleForSettings}-settings.json`;
    await saveEncryptedData(settingsFilename, defaultUserSettings);

    logEvent(newUser.username, newUser.role, 'ADD_USER_SUCCESS', 'INFO', { targetUser: newUser.username, targetRole: newUser.role });
    const successMsg = debugMode ? `User "${newUser.username}" added successfully to ${filename}.` : `User "${newUser.username}" added successfully.`;
    return { status: "success", message: successMsg, user: newUser };

  } catch (e: any) {
    console.error("[RolesActions - addUser] Error adding user:", e.message, e.stack);
    logEvent(userInput.username, userInput.role, 'ADD_USER_EXCEPTION', 'ERROR', { targetUser: userInput.username, error: e.message });
    const errorMsg = debugMode ? `Error adding user: ${e.message}` : "An unexpected error occurred while adding the user.";
    return { status: "error", message: errorMsg, errors: { _form: [errorMsg] } };
  }
}

export async function updateUser(prevState: UserActionState, userInput: UpdateUserInput): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  const now = new Date().toISOString();

  if (debugMode) console.log(`[RolesActions - updateUser] Attempting to update user ID: ${userInput.id}`);

  if (userInput.id === 'owner_root') {
    // Owner profile data is primarily managed via ensureOwnerFileExists on login based on .env
    // However, some non-critical fields might be updatable via UI if desired.
    // For now, let's assume only status or cosmetic things could be changed here, not username/role/password.
    const ownerData = await loadUserById('owner_root');
    if (!ownerData) {
        logEvent('System', 'System', 'UPDATE_USER_OWNER_PROFILE_NOT_FOUND', 'ERROR');
        return { status: "error", message: "Owner profile data not found. Cannot update." };
    }
    const updatedOwnerData: UserData = {
        ...ownerData,
        assignedPages: userInput.assignedPages !== undefined ? userInput.assignedPages : ownerData.assignedPages,
        allowedSettingsPages: userInput.allowedSettingsPages !== undefined ? userInput.allowedSettingsPages : ownerData.allowedSettingsPages,
        projects: userInput.projects !== undefined ? userInput.projects : ownerData.projects,
        status: userInput.status || ownerData.status,
        updatedAt: now,
    };
    const ownerFilename = path.basename(getUserFilePath(ownerData.username, ownerData.role));
    try {
        await saveEncryptedData(ownerFilename, updatedOwnerData);
        logEvent('System', 'System', 'UPDATE_OWNER_SETTINGS_VIA_UI_SUCCESS', 'INFO', { targetUser: ownerData.username });
        return { status: "success", message: "Owner settings (assigned pages/projects/status) updated successfully.", user: updatedOwnerData };
    } catch (e: any) {
        console.error(`[RolesActions - updateUser] Error saving updated owner file ${ownerFilename}:`, e.message);
        logEvent('System', 'System', 'UPDATE_OWNER_SETTINGS_VIA_UI_FAILED', 'ERROR', { targetUser: ownerData.username, error: e.message });
        return { status: "error", message: `Failed to save owner settings: ${e.message}` };
    }
  }

  const validatedChanges = updateUserInputSchema.safeParse(userInput);
  if (!validatedChanges.success) {
    if (debugMode) console.error("[RolesActions - updateUser] Validation failed:", validatedChanges.error.flatten().fieldErrors);
    logEvent(userInput.username, userInput.role, 'UPDATE_USER_VALIDATION_FAILED', 'WARN', { targetUserId: userInput.id, errors: validatedChanges.error.flatten().fieldErrors });
    return { status: "error", message: "Validation failed. Please check the fields.", errors: validatedChanges.error.flatten().fieldErrors };
  }
  const { password: newPassword, ...updatesToApply } = validatedChanges.data;

  try {
    const currentUserData = await loadUserById(userInput.id);
    if (!currentUserData || currentUserData.id === 'owner_root') { 
      logEvent(userInput.username, userInput.role, 'UPDATE_USER_NOT_FOUND_OR_IS_OWNER', 'ERROR', { targetUserId: userInput.id });
      return { status: "error", message: "User not found or cannot be modified this way.", errors: { _form: ["User not found."] } };
    }

    const oldUsername = currentUserData.username;
    const oldRole = currentUserData.role;
    const oldFilename = path.basename(getUserFilePath(oldUsername, oldRole));
    const oldSettingsFilename = `${oldUsername.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${oldRole.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
    const dataPath = getDataPath();

    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
        if (updatesToApply.username === process.env.OWNER_USERNAME) {
            logEvent(updatesToApply.username, updatesToApply.role, 'UPDATE_USER_FAILED_USERNAME_IS_OWNER', 'WARN', { targetUserId: userInput.id });
            return { status: "error", message: "Cannot change username to the Owner's reserved username.", errors: { username: ["This username is reserved."] } };
        }
        const usersResult = await loadUsers();
        if (usersResult.users && usersResult.users.some(u => u.username === updatesToApply.username && u.id !== userInput.id)) {
            logEvent(updatesToApply.username, updatesToApply.role, 'UPDATE_USER_FAILED_NEW_USERNAME_EXISTS', 'WARN', { targetUserId: userInput.id });
            return { status: "error", message: "New username already exists.", errors: { username: ["Username already taken"] } };
        }
    }
    
    const updatedUser: UserData = {
      ...currentUserData,
      ...updatesToApply, 
      role: updatesToApply.role, 
      updatedAt: now,
    };

    if (newPassword && newPassword.length > 0) {
      const { hash, salt } = await hashPassword(newPassword);
      updatedUser.hashedPassword = hash;
      updatedUser.salt = salt;
    }

    const newSafeUsername = updatedUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const newSafeRole = updatedUser.role.replace(/[^a-zA-Z0-9]/g, '_');
    const newFilename = `${newSafeUsername}-${newSafeRole}.json`;
    const newSettingsFilename = `${newSafeUsername}-${newSafeRole}-settings.json`;

    await saveEncryptedData(newFilename, updatedUser);

    if (oldFilename !== newFilename) {
      if (debugMode) console.log(`[RolesActions - updateUser] Username or role changed. Old user file: ${oldFilename}, New user file: ${newFilename}`);
      const oldSettingsPath = path.join(dataPath, oldSettingsFilename);
      const newSettingsPath = path.join(dataPath, newSettingsFilename);
      if (fs.existsSync(oldSettingsPath)) {
        try {
          await fs.rename(oldSettingsPath, newSettingsPath);
          if (debugMode) console.log(`[RolesActions - updateUser] Renamed settings file from ${oldSettingsFilename} to ${newSettingsFilename}`);
        } catch (renameError: any) {
          console.warn(`[RolesActions - updateUser] Could not rename settings file ${oldSettingsFilename} to ${newSettingsFilename}. Error: ${renameError.message}`);
          logEvent(updatedUser.username, updatedUser.role, 'UPDATE_USER_SETTINGS_FILE_RENAME_FAILED', 'WARN', { old: oldSettingsFilename, new: newSettingsFilename, error: renameError.message});
        }
      }
      try {
        await fs.unlink(path.join(dataPath, oldFilename));
        if (debugMode) console.log(`[RolesActions - updateUser] Deleted old user file: ${oldFilename}`);
      } catch (e: any) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn(`[RolesActions - updateUser] Could not delete old user file ${oldFilename} after rename/role change:`, e.message);
            logEvent(updatedUser.username, updatedUser.role, 'UPDATE_USER_OLD_FILE_DELETE_FAILED', 'WARN', { oldFilename: oldFilename, error: e.message});
        }
      }
    }
    
    logEvent(updatedUser.username, updatedUser.role, 'UPDATE_USER_SUCCESS', 'INFO', { targetUserId: updatedUser.id, targetUsername: updatedUser.username });
    const successMsg = debugMode ? `User "${updatedUser.username}" updated successfully. File: ${newFilename}.` : `User "${updatedUser.username}" updated successfully.`;
    return { status: "success", message: successMsg, user: updatedUser };

  } catch (e: any) {
    console.error(`[RolesActions - updateUser] Error updating user ID ${userInput.id}:`, e.message, e.stack);
    logEvent(userInput.username, userInput.role, 'UPDATE_USER_EXCEPTION', 'ERROR', { targetUserId: userInput.id, error: e.message });
    const errorMsg = debugMode ? `Error updating user: ${e.message}` : "An unexpected error occurred while updating the user.";
    return { status: "error", message: errorMsg, errors: { _form: [errorMsg] } };
  }
}

export async function deleteUser(userId: string): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  if (debugMode) console.log(`[RolesActions - deleteUser] Attempting to delete user ID: ${userId}`);

  if (!userId) {
    logEvent('System', 'System', 'DELETE_USER_FAILED_NO_ID', 'WARN');
    return { status: "error", message: "User ID is required for deletion." };
  }
  if (userId === 'owner_root') {
    logEvent('System', 'System', 'DELETE_USER_FAILED_IS_OWNER', 'WARN');
    return { status: "error", message: "Owner account cannot be deleted." };
  }

  try {
    const userToDelete = await loadUserById(userId);
    if (!userToDelete) {
      logEvent('System', 'System', 'DELETE_USER_FAILED_NOT_FOUND', 'ERROR', { targetUserId: userId });
      return { status: "error", message: "User not found for deletion." };
    }

    const filenameToDelete = path.basename(getUserFilePath(userToDelete.username, userToDelete.role));
    const safeUsernameForSettings = userToDelete.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRoleForSettings = userToDelete.role.replace(/[^a-zA-Z0-9]/g, '_');
    const settingsFilenameToDelete = `${safeUsernameForSettings}-${safeRoleForSettings}-settings.json`;
    const authSessionFilenameToDelete = `${safeUsernameForSettings}-${safeRoleForSettings}-Auth.json`;
    const dataPath = getDataPath();

    const filesToDelete = [filenameToDelete, settingsFilenameToDelete, authSessionFilenameToDelete];

    for (const file of filesToDelete) {
        try {
            await fs.unlink(path.join(dataPath, file));
            if (debugMode) console.log(`[RolesActions - deleteUser] Deleted file: ${file}`);
        } catch (e: any) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                if (debugMode) console.warn(`[RolesActions - deleteUser] File not found, presumed already deleted: ${file}`);
            } else {
                console.error(`[RolesActions - deleteUser] Failed to delete file ${file}: ${e.message}`);
                logEvent(userToDelete.username, userToDelete.role, 'DELETE_USER_FILE_DELETION_FAILED', 'ERROR', { filename: file, error: e.message});
                // Decide if this should be a fatal error for the whole operation
            }
        }
    }

    logEvent(userToDelete.username, userToDelete.role, 'DELETE_USER_SUCCESS', 'INFO', { targetUserId: userId, targetUsername: userToDelete.username });
    const successMsg = debugMode ? `User "${userToDelete.username}" and associated files deleted.` : `User deleted successfully.`;
    return { status: "success", message: successMsg };

  } catch (e: any) {
    console.error(`[RolesActions - deleteUser] Error deleting user ID ${userId}:`, e.message, e.stack);
    logEvent('System', 'System', 'DELETE_USER_EXCEPTION', 'ERROR', { targetUserId: userId, error: e.message });
    const errorMsg = debugMode ? `Error deleting user: ${e.message}` : "An unexpected error occurred while deleting the user.";
    return { status: "error", message: errorMsg, errors: { _form: [errorMsg] } };
  }
}
