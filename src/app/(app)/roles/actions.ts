
'use server';

import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs/promises';
import { type PanelSettingsData, explicitDefaultPanelSettings } from '@/app/(app)/settings/types';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { logEvent } from '@/lib/logger';
import { defaultUserSettings, type UserSettingsData } from '@/lib/user-settings';
import { userSchema, addUserInputSchema, updateUserInputSchema, type UserData, type UserInput, type UserActionState, type LoadUsersState } from './types';
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { redirect } from "next/navigation";
import { createOrUpdateServerSessionFile, deleteServerSessionFile } from "@/app/login/actions";


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

function getUserFilePath(username: string, role: UserData["role"]): string {
  const dataPath = getDataPath();
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${safeUsername}-${safeRole}.json`;
  return path.join(dataPath, filename);
}

async function getPanelSettingsForDebug(): Promise<PanelSettingsData> {
    const panelGlobalSettingsResult = await loadPanelSettings();
    return panelGlobalSettingsResult.data ?? explicitDefaultPanelSettings;
}

export async function ensureOwnerFileExists(ownerUsernameEnv: string, ownerPasswordPlain: string, panelSettings?: PanelSettingsData): Promise<void> {
  const debugMode = panelSettings?.debugMode ?? (await getPanelSettingsForDebug()).debugMode;
  const sanitizedOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ownerFilename = `${sanitizedOwnerUsername}-Owner.json`;
  const ownerFilePath = path.join(getDataPath(), ownerFilename);

  if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Ensuring file for Owner: ${ownerUsernameEnv}, path: ${ownerFilePath}`);

  let existingOwnerData: Partial<UserData> = {};
  let fileExists = false;
  try {
    const loaded = await loadEncryptedData(ownerFilename);
    if (loaded && typeof loaded === 'object' && 'id' in loaded && loaded.id === 'owner_root') {
      fileExists = true;
      existingOwnerData = loaded as UserData;
      if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Loaded existing owner file for ${ownerUsernameEnv}. Preserving createdAt: ${existingOwnerData.createdAt}, lastLogin: ${existingOwnerData.lastLogin}`);
    } else if (loaded) {
      if (debugMode) console.warn(`[RolesActions - ensureOwnerFileExists] Owner file ${ownerFilename} exists but ID is not 'owner_root' or format is wrong. Will overwrite.`);
    } else {
       if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] No existing owner file ${ownerFilename} found, or it was empty. Will create anew.`);
    }
  } catch (e: any) {
    console.error(`[RolesActions - ensureOwnerFileExists] Error loading/decrypting existing owner file ${ownerFilename}. Will attempt to create anew. Error:`, e.message);
  }
  
  let hash: string, salt: string;
  try {
    ({ hash, salt } = await hashPassword(ownerPasswordPlain));
    if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Password hashed for ${ownerUsernameEnv}.`);
  } catch (hashError: any) {
    console.error(`[RolesActions - ensureOwnerFileExists] CRITICAL: Failed to hash owner password for ${ownerUsernameEnv}:`, hashError);
    throw new Error(`Failed to hash owner password for ${ownerUsernameEnv}: ${hashError.message || String(hashError)}`);
  }
  
  const now = new Date().toISOString();

  const ownerData: UserData = {
    id: 'owner_root',
    username: ownerUsernameEnv,
    hashedPassword: hash,
    salt: salt,
    role: 'Owner',
    projects: existingOwnerData.projects || [], 
    assignedPages: existingOwnerData.assignedPages || [], 
    allowedSettingsPages: existingOwnerData.allowedSettingsPages || [], 
    status: existingOwnerData.status || 'Active',
    createdAt: existingOwnerData.createdAt || now,
    updatedAt: now,
    lastLogin: fileExists ? (existingOwnerData.lastLogin || now) : now,
  };

  try {
    if(debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Preparing to save owner data to ${ownerFilename}:`, {id: ownerData.id, username: ownerData.username, role: ownerData.role, lastLogin: ownerData.lastLogin});
    await saveEncryptedData(ownerFilename, ownerData);
    if(debugMode) {
      console.log(`[RolesActions - ensureOwnerFileExists] Successfully called saveEncryptedData for ${ownerFilename}.`);
      if (await fs.stat(ownerFilePath).catch(() => null)) { 
        console.log(`[RolesActions - ensureOwnerFileExists] VERIFIED: Owner file ${ownerFilename} exists at ${ownerFilePath} after save.`);
      } else {
        console.error(`[RolesActions - ensureOwnerFileExists] CRITICAL VERIFICATION FAILURE: Owner file ${ownerFilename} DOES NOT EXIST at ${ownerFilePath} after save.`);
      }
    }
  } catch (e: any) {
    console.error(`[RolesActions - ensureOwnerFileExists] CRITICAL: Failed to save owner file ${ownerFilename}:`, e);
    throw new Error(`Failed to save owner file ${ownerFilename}: ${e.message || String(e)}`);
  }
}

export async function loadUsers(): Promise<LoadUsersState> {
  const panelGlobalSettings = await getPanelSettingsForDebug();
  const debugMode = panelGlobalSettings.debugMode;
  if (debugMode) console.log("[RolesActions - loadUsers] Attempting to load users from individual files...");

  const dataPath = getDataPath();
  const users: UserData[] = [];
  let files: string[];

  try {
    files = await fs.readdir(dataPath);
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      if (debugMode) console.log("[RolesActions - loadUsers] Data directory not found. Returning empty list.");
      return { users: [], status: "success" };
    }
    console.error("[RolesActions - loadUsers] Error reading data directory:", e);
    return { error: "Failed to read user data directory.", status: "error" };
  }

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const safeOwnerFilename = ownerUsernameEnv ? `${ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_')}-Owner.json` : null;

  for (const file of files) {
    if ( file.endsWith('.json') && 
        !file.endsWith('-Auth.json') && 
        !file.endsWith('-settings.json') && 
         file !== '.settings.json' && 
        (!safeOwnerFilename || file !== safeOwnerFilename) ) {
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            if (parsedUser.data.id !== 'owner_root') {
                users.push(parsedUser.data);
            } else if (debugMode) {
                 console.warn(`[RolesActions - loadUsers] Skipped file ${file} as it parsed to owner_root ID unexpectedly.`);
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
    const panelGlobalSettings = await getPanelSettingsForDebug();
    const debugMode = panelGlobalSettings.debugMode;
    if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load user ID: ${userId}`);
    const dataPath = getDataPath();
  
    if (userId === 'owner_root') {
        const ownerUsernameEnv = process.env.OWNER_USERNAME;
        if (!ownerUsernameEnv) {
            if (debugMode) console.error("[RolesActions - loadUserById] OWNER_USERNAME not set in .env.local, cannot load owner_root by ID 'owner_root'.");
            return null;
        }
        const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const ownerFilename = `${safeOwnerUsername}-Owner.json`;
        if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load owner_root (ID: 'owner_root') from file: ${path.join(dataPath, ownerFilename)} (derived from env OWNER_USERNAME: ${ownerUsernameEnv})`);
        try {
            const fileData = await loadEncryptedData(ownerFilename);
            if (fileData) {
                const parsedUser = userSchema.safeParse(fileData);
                if (parsedUser.success && parsedUser.data.id === 'owner_root') { 
                    if (debugMode) console.log(`[RolesActions - loadUserById] Successfully loaded owner_root (ID: 'owner_root') from ${ownerFilename}`);
                    return parsedUser.data;
                } else if (debugMode) {
                    if (!parsedUser.success) {
                        console.warn(`[RolesActions - loadUserById] Failed to parse owner file ${ownerFilename}:`, parsedUser.error.flatten().fieldErrors);
                    } else { 
                        console.warn(`[RolesActions - loadUserById] Loaded owner file ${ownerFilename}, but its ID is '${parsedUser.data.id}', not 'owner_root' as expected. This is problematic.`);
                    }
                }
            } else if (debugMode) {
                console.warn(`[RolesActions - loadUserById] Owner file ${ownerFilename} (for ID 'owner_root') not found or empty.`);
            }
        } catch (e: any) {
            if (debugMode) console.error(`[RolesActions - loadUserById] Error loading or decrypting owner file ${ownerFilename} (for ID 'owner_root'):`, e.message);
        }
        if (debugMode) console.warn(`[RolesActions - loadUserById] Failed to load user with ID 'owner_root' from ${ownerFilename}.`);
        return null;
    }

    let files: string[];
    try {
        files = await fs.readdir(dataPath);
    } catch(e: any) {
        if (debugMode) console.warn(`[RolesActions - loadUserById] Error reading data directory for user ID ${userId}:`, e.message);
        return null;
    }

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const safeOwnerFilename = ownerUsernameEnv ? `${ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_')}-Owner.json` : null;

    for (const file of files) {
        if ( file.endsWith('.json') && 
            !file.endsWith('-Auth.json') && 
            !file.endsWith('-settings.json') && 
             file !== '.settings.json' && 
            (!safeOwnerFilename || file !== safeOwnerFilename) ) {
            try {
                const fileData = await loadEncryptedData(file);
                if (fileData) {
                    const parsedUser = userSchema.safeParse(fileData);
                    if (parsedUser.success && parsedUser.data.id === userId) {
                        if (debugMode) console.log(`[RolesActions - loadUserById] Found user ID ${userId} in file ${file}`);
                        return parsedUser.data;
                    }
                }
            } catch (e: any) { 
                if (debugMode) console.warn(`[RolesActions - loadUserById] Error processing file ${file} for user ID ${userId}: ${e.message}`);
            }
        }
    }
    if (debugMode) console.log(`[RolesActions - loadUserById] User ID ${userId} not found in any non-owner user file.`);
    return null;
}

export async function addUser(prevState: UserActionState, userInput: AddUserInput): Promise<UserActionState> {
  const panelGlobalSettings = await getPanelSettingsForDebug();
  const debugMode = panelGlobalSettings.debugMode;
  // TODO: Get actual actor username/role from session once available
  const actorUsername = 'System'; 
  const actorRole = 'System';   

  if (debugMode) console.log(`[RolesActions - addUser] Attempting to add user: ${userInput.username} by ${actorUsername}`);
  const now = new Date().toISOString();

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  if (ownerUsernameEnv && userInput.username === ownerUsernameEnv) {
    logEvent(actorUsername, actorRole, 'ADD_USER_FAILED_OWNER_USERNAME', 'WARN', { targetUser: userInput.username });
    return { message: "Cannot add a user with the same username as the Owner.", status: "error", errors: { username: ["This username is reserved for the Owner account."] } };
  }

  const validatedFields = addUserInputSchema.safeParse(userInput);
  if (!validatedFields.success) {
    if (debugMode) console.error("[RolesActions - addUser] Add user validation failed:", validatedFields.error.flatten().fieldErrors);
    logEvent(actorUsername, actorRole, 'ADD_USER_VALIDATION_FAILED', 'WARN', { targetUser: userInput.username, errors: validatedFields.error.flatten().fieldErrors });
    return { message: "Validation failed for new user.", status: "error", errors: validatedFields.error.flatten().fieldErrors };
  }

  const { password, ...userDataToStore } = validatedFields.data;

  try {
    const allUsersResult = await loadUsers();
    if (allUsersResult.users?.some(u => u.username === userDataToStore.username)) {
      logEvent(actorUsername, actorRole, 'ADD_USER_FAILED_USERNAME_EXISTS', 'WARN', { targetUser: userDataToStore.username });
      return { message: "Username already exists.", status: "error", errors: { username: ["Username already taken"] } };
    }

    const { hash, salt } = await hashPassword(password);
    const newUser: UserData = {
      id: uuidv4(),
      ...userDataToStore,
      hashedPassword: hash,
      salt: salt,
      createdAt: now,
      updatedAt: now,
      lastLogin: undefined, 
    };

    const userFilename = path.basename(getUserFilePath(newUser.username, newUser.role));
    await saveEncryptedData(userFilename, newUser);
    if (debugMode) console.log(`[RolesActions - addUser] Saved new user ${newUser.username} to ${userFilename}`);
    
    const safeUsernameForSettings = newUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRoleForSettings = newUser.role.replace(/[^a-zA-Z0-9]/g, '_');
    const settingsFilename = `${safeUsernameForSettings}-${safeRoleForSettings}-settings.json`;
    await saveEncryptedData(settingsFilename, defaultUserSettings);
    if (debugMode) console.log(`[RolesActions - addUser] Created default settings file ${settingsFilename} for ${newUser.username}`);

    logEvent(actorUsername, actorRole, 'ADD_USER_SUCCESS', 'INFO', { targetUser: newUser.username, targetRole: newUser.role });
    const successMessage = debugMode ? `User "${newUser.username}" added successfully. File: ${userFilename}.` : `User "${newUser.username}" added successfully.`;
    return { message: successMessage, status: "success", user: newUser };
  } catch (e:any) {
    console.error("[RolesActions - addUser] Error adding user:", e);
    logEvent(actorUsername, actorRole, 'ADD_USER_EXCEPTION', 'ERROR', { targetUser: userInput.username, error: e.message });
    return { message: `Error adding user: ${e.message}`, status: "error", errors: { _form: [e.message] } };
  }
}

export async function updateUser(prevState: UserActionState, userInput: UpdateUserInput): Promise<UserActionState> {
  const panelGlobalSettings = await getPanelSettingsForDebug();
  const debugMode = panelGlobalSettings.debugMode;
  const actorUsername = 'System'; 
  const actorRole = 'System';   

  if (debugMode) console.log(`[RolesActions - updateUser] Attempting to update user ID: ${userInput.id} by ${actorUsername}`);

  const validatedChanges = updateUserInputSchema.safeParse(userInput);
  if (!validatedChanges.success) {
    if (debugMode) console.error("[RolesActions - updateUser] Update user validation failed:", validatedChanges.error.flatten().fieldErrors);
    logEvent(actorUsername, actorRole, 'UPDATE_USER_VALIDATION_FAILED', 'WARN', { targetUserId: userInput.id, errors: validatedChanges.error.flatten().fieldErrors });
    return { message: "Validation failed for user update.", status: "error", errors: validatedChanges.error.flatten().fieldErrors };
  }

  const { password: newPassword, id: userIdToUpdate, ...updatesToApply } = validatedChanges.data;
  const now = new Date().toISOString();

  try {
    const currentUserData = await loadUserById(userIdToUpdate);
    if (!currentUserData) {
      logEvent(actorUsername, actorRole, 'UPDATE_USER_NOT_FOUND', 'ERROR', { targetUserId: userIdToUpdate });
      return { message: "User not found for update.", status: "error", errors: { _form: ["User to update not found."] } };
    }

    if (currentUserData.id === 'owner_root' && (updatesToApply.username !== currentUserData.username || updatesToApply.role !== 'Owner')) {
        logEvent(actorUsername, actorRole, 'UPDATE_USER_OWNER_PROTECTED_FIELD_CHANGE_ATTEMPT', 'WARN', { targetUser: currentUserData.username });
        return { message: "Owner's username and role cannot be changed.", status: "error", errors: { _form: ["Owner's username and role cannot be changed."] } };
    }

    const oldUserFilename = path.basename(getUserFilePath(currentUserData.username, currentUserData.role));
    const oldSettingsFilename = `${currentUserData.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${currentUserData.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;

    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
      const ownerUsernameEnv = process.env.OWNER_USERNAME;
      if (ownerUsernameEnv && updatesToApply.username === ownerUsernameEnv) {
        logEvent(actorUsername, actorRole, 'UPDATE_USER_FAILED_OWNER_USERNAME_CONFLICT', 'WARN', { targetUserId: userIdToUpdate, newUsername: updatesToApply.username });
        return { message: "Cannot change username to Owner's username.", status: "error", errors: { username: ["This username is reserved."] }};
      }
      const allUsersResult = await loadUsers();
      if (allUsersResult.users?.some(u => u.username === updatesToApply.username && u.id !== userIdToUpdate)) {
        logEvent(actorUsername, actorRole, 'UPDATE_USER_FAILED_USERNAME_EXISTS', 'WARN', { targetUserId: userIdToUpdate, newUsername: updatesToApply.username });
        return { message: "New username already exists.", status: "error", errors: { username: ["New username is already taken."] } };
      }
    }

    const updatedUser: UserData = {
      ...currentUserData,
      ...updatesToApply, 
      updatedAt: now,
    };

    if (newPassword && newPassword.length > 0) {
      if (currentUserData.id === 'owner_root') {
          logEvent(actorUsername, actorRole, 'UPDATE_USER_OWNER_PASSWORD_CHANGE_UI_ATTEMPT', 'WARN', { targetUser: currentUserData.username });
      } else {
          const { hash, salt } = await hashPassword(newPassword);
          updatedUser.hashedPassword = hash;
          updatedUser.salt = salt;
      }
    }
    
    const newUserFilename = path.basename(getUserFilePath(updatedUser.username, updatedUser.role));
    const newSettingsFilename = `${updatedUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${updatedUser.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
    const dataPath = getDataPath();

    if (oldUserFilename !== newUserFilename && currentUserData.id !== 'owner_root') {
      await saveEncryptedData(newUserFilename, updatedUser);
      if (debugMode) console.log(`[RolesActions - updateUser] Saved updated user ${updatedUser.username} to new file: ${newUserFilename}`);
      try {
        await fs.unlink(path.join(dataPath, oldUserFilename)); 
        if (debugMode) console.log(`[RolesActions - updateUser] Deleted old user file: ${oldUserFilename}`);
      } catch (e: any) {
        if (e.code !== 'ENOENT') console.warn(`[RolesActions - updateUser] Could not delete old user file ${oldUserFilename} for ${currentUserData.username}:`, e.message);
      }
    } else { 
      await saveEncryptedData(newUserFilename, updatedUser);
      if (debugMode) console.log(`[RolesActions - updateUser] Saved updated user ${updatedUser.username} to file: ${newUserFilename}`);
    }

    if (currentUserData.id !== 'owner_root' && (oldSettingsFilename !== newSettingsFilename)) {
        const oldSettingsPath = path.join(dataPath, oldSettingsFilename);
        const newSettingsPath = path.join(dataPath, newSettingsFilename);
        try {
          if (await fs.stat(oldSettingsPath).catch(() => null)) {
            await fs.rename(oldSettingsPath, newSettingsPath);
            if (debugMode) console.log(`[RolesActions - updateUser] Renamed settings file from ${oldSettingsFilename} to ${newSettingsFilename} for ${updatedUser.username}`);
          } else {
            if (debugMode) console.log(`[RolesActions - updateUser] Old settings file ${oldSettingsFilename} not found for ${currentUserData.username}, creating new one at ${newSettingsFilename}`);
            await saveEncryptedData(newSettingsFilename, defaultUserSettings); 
          }
        } catch (renameError: any) {
            console.warn(`[RolesActions - updateUser] Could not rename settings file ${oldSettingsFilename} to ${newSettingsFilename} for ${updatedUser.username}. Attempting to create default at new location. Error: ${renameError.message}`);
            await saveEncryptedData(newSettingsFilename, defaultUserSettings);
        }
    }

    logEvent(actorUsername, actorRole, 'UPDATE_USER_SUCCESS', 'INFO', { targetUserId: updatedUser.id, targetUsername: updatedUser.username });
    const successMessage = debugMode ? `User "${updatedUser.username}" updated. File: ${newUserFilename}.` : `User "${updatedUser.username}" updated.`;
    return { message: successMessage, status: "success", user: updatedUser };
  } catch (e:any) {
    console.error(`[RolesActions - updateUser] Error updating user ID ${userIdToUpdate}:`, e);
    logEvent(actorUsername, actorRole, 'UPDATE_USER_EXCEPTION', 'ERROR', { targetUserId: userIdToUpdate, error: e.message });
    return { message: `Error updating user: ${e.message}`, status: "error", errors: { _form: [e.message] } };
  }
}

export async function deleteUser(userId: string): Promise<UserActionState> {
  const panelGlobalSettings = await getPanelSettingsForDebug();
  const debugMode = panelGlobalSettings.debugMode;
  const actorUsername = 'System'; 
  const actorRole = 'System';   

  if (debugMode) console.log(`[RolesActions - deleteUser] Attempting to delete user ID: ${userId} by ${actorUsername}`);

  if (!userId) {
    logEvent(actorUsername, actorRole, 'DELETE_USER_FAILED_NO_ID', 'WARN');
    return { message: "User ID is required for deletion.", status: "error" };
  }
  if (userId === 'owner_root') {
    logEvent(actorUsername, actorRole, 'DELETE_USER_FAILED_OWNER_ACCOUNT', 'WARN');
    return { message: "Owner account cannot be deleted.", status: "error" };
  }

  try {
    const userToDelete = await loadUserById(userId);
    if (!userToDelete) {
      logEvent(actorUsername, actorRole, 'DELETE_USER_NOT_FOUND', 'ERROR', { targetUserId: userId });
      return { message: "User not found for deletion.", status: "error" };
    }

    const userFilenameToDelete = path.basename(getUserFilePath(userToDelete.username, userToDelete.role));
    const settingsFilenameToDelete = `${userToDelete.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${userToDelete.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
    const authFilenameToDelete = `${userToDelete.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${userToDelete.role.replace(/[^a-zA-Z0-9]/g, '_')}-Auth.json`;
    
    const dataPath = getDataPath();

    for (const filename of [userFilenameToDelete, settingsFilenameToDelete, authFilenameToDelete]) {
        const filePathToDelete = path.join(dataPath, filename);
        try {
            if (await fs.stat(filePathToDelete).catch(() => null)) { 
                await fs.unlink(filePathToDelete);
                if (debugMode) console.log(`[RolesActions - deleteUser] Deleted file: ${filename} for user ${userToDelete.username}`);
            } else if (debugMode) {
                 console.warn(`[RolesActions - deleteUser] File not found, skipping deletion: ${filename} for user ${userToDelete.username}`);
            }
        } catch (e: any) {
            console.warn(`[RolesActions - deleteUser] Could not delete file ${filename} for user ${userToDelete.username}. It might need manual cleanup. Error: ${e.message}`);
        }
    }

    logEvent(actorUsername, actorRole, 'DELETE_USER_SUCCESS', 'INFO', { targetUserId: userId, targetUsername: userToDelete.username });
    const successMessage = debugMode ? `User "${userToDelete.username}" (and associated files) deleted successfully.` : `User deleted successfully.`;
    return { message: successMessage, status: "success" };
  } catch (e:any) {
    console.error(`[RolesActions - deleteUser] Error deleting user ID ${userId}:`, e);
    logEvent(actorUsername, actorRole, 'DELETE_USER_EXCEPTION', 'ERROR', { targetUserId: userId, error: e.message });
    return { message: `Error deleting user: ${e.message}`, status: "error", errors: { _form: [e.message] } };
  }
}

// --- Impersonation Actions ---
export interface ImpersonationState {
  status: "success" | "error" | "idle";
  message: string;
}

export async function startImpersonation(targetUserId: string): Promise<ImpersonationState> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  const panelSettings = await loadPanelSettings();
  const debugMode = panelSettings.data?.debugMode ?? false;

  if (debugMode) console.log(`[RolesActions - startImpersonation] Attempt by ${session.username} (Role: ${session.role}) to impersonate user ID: ${targetUserId}`);

  if (!session.isLoggedIn || !session.userId || !session.username || !session.role) {
    logEvent('Unknown', 'Unknown', 'IMPERSONATE_START_NO_SESSION', 'WARN');
    return { status: "error", message: "Not authenticated." };
  }

  if (session.role !== 'Owner' && session.role !== 'Administrator') {
    logEvent(session.username, session.role, 'IMPERSONATE_START_NO_PERMISSION', 'WARN', { targetUserId });
    return { status: "error", message: "You do not have permission to impersonate users." };
  }

  if (session.userId === targetUserId) {
    logEvent(session.username, session.role, 'IMPERSONATE_START_SELF', 'INFO', { targetUserId });
    return { status: "error", message: "You cannot impersonate yourself." };
  }
  
  const targetUser = await loadUserById(targetUserId);
  if (!targetUser) {
    logEvent(session.username, session.role, 'IMPERSONATE_START_TARGET_NOT_FOUND', 'WARN', { targetUserId });
    return { status: "error", message: "Target user not found." };
  }

  if (targetUser.id === 'owner_root' || targetUser.role === 'Owner') {
    logEvent(session.username, session.role, 'IMPERSONATE_START_TARGET_OWNER', 'WARN', { targetUserId });
    return { status: "error", message: "Cannot impersonate the Owner." };
  }
  if (targetUser.status === 'Inactive') {
    logEvent(session.username, session.role, 'IMPERSONATE_START_TARGET_INACTIVE', 'WARN', { targetUserId });
    return { status: "error", message: "Cannot impersonate an inactive user." };
  }

  // Store original user's data in session
  session.originalUserId = session.userId;
  session.originalUsername = session.username;
  session.originalUserRole = session.role;
  session.isImpersonating = true;

  // Switch session to target user
  session.userId = targetUser.id;
  session.username = targetUser.username;
  session.role = targetUser.role;
  session.lastActivity = Date.now(); 

  const defaultSessionTimeout = panelSettings.data?.sessionInactivityTimeout ?? 30;
  const defaultDisableAutoLogout = panelSettings.data?.disableAutoLogoutOnInactivity ?? false;
  const impersonationToken = crypto.randomBytes(32).toString('hex');

  try {
    await createOrUpdateServerSessionFile(
      targetUser.username,
      targetUser.role,
      targetUser.id,
      impersonationToken,
      defaultSessionTimeout,
      defaultDisableAutoLogout,
      debugMode
    );
    if (debugMode) console.log(`[RolesActions - startImpersonation] Server session file created for impersonated user ${targetUser.username}`);
  } catch (e: any) {
    console.error(`[RolesActions - startImpersonation] Failed to create server session file for impersonated user ${targetUser.username}:`, e);
    session.userId = session.originalUserId;
    session.username = session.originalUsername;
    session.role = session.originalUserRole;
    session.isImpersonating = false;
    delete session.originalUserId;
    delete session.originalUsername;
    delete session.originalUserRole;
    await session.save();
    logEvent(session.username, session.originalUserRole!, 'IMPERSONATE_START_SESSION_FILE_ERROR', 'ERROR', { targetUserId: targetUser.id, error: e.message });
    return { status: "error", message: `Failed to start impersonation: ${e.message}` };
  }
  
  await session.save();
  logEvent(session.originalUsername!, session.originalUserRole!, 'IMPERSONATE_START_SUCCESS', 'INFO', { targetUserId: targetUser.id, targetUsername: targetUser.username, targetRole: targetUser.role });
  if (debugMode) console.log(`[RolesActions - startImpersonation] ${session.originalUsername} successfully started impersonating ${targetUser.username}. Redirecting...`);
  
  redirect('/'); 
  return { status: "success", message: `Now impersonating ${targetUser.username}.` };
}

export async function stopImpersonation(): Promise<ImpersonationState> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  const panelSettings = await loadPanelSettings();
  const debugMode = panelSettings.data?.debugMode ?? false;

  if (debugMode) console.log(`[RolesActions - stopImpersonation] Attempt by effective user ${session.username} (Original: ${session.originalUsername})`);

  if (!session.isImpersonating || !session.originalUserId || !session.originalUsername || !session.originalUserRole) {
    logEvent(session.username || 'Unknown', session.role || 'Unknown', 'IMPERSONATE_STOP_NOT_IMPERSONATING', 'WARN');
    return { status: "error", message: "Not currently impersonating." };
  }

  const impersonatedUsername = session.username; 
  const impersonatedRole = session.role;     

  session.userId = session.originalUserId;
  session.username = session.originalUsername;
  session.role = session.originalUserRole;
  session.isImpersonating = false;
  delete session.originalUserId;
  delete session.originalUsername;
  delete session.originalUserRole;
  session.lastActivity = Date.now(); 

  await session.save();

  if (impersonatedUsername && impersonatedRole) {
    try {
      await deleteServerSessionFile(impersonatedUsername, impersonatedRole, debugMode);
    } catch (e: any) {
      console.error(`[RolesActions - stopImpersonation] Failed to delete session file for ${impersonatedUsername}:`, e);
      logEvent(session.username, session.role, 'IMPERSONATE_STOP_SESSION_FILE_DELETE_ERROR', 'ERROR', { targetUser: impersonatedUsername, error: e.message });
    }
  }
  
  logEvent(session.username, session.role, 'IMPERSONATE_STOP_SUCCESS', 'INFO');
  if (debugMode) console.log(`[RolesActions - stopImpersonation] ${session.username} stopped impersonating. Redirecting to /roles...`);

  redirect('/roles'); 
  return { status: "success", message: "Impersonation stopped." };
}

