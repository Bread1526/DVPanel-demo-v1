
'use server';

import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs/promises'; 
import { type PanelSettingsData, loadPanelSettings as loadGlobalPanelSettings } from '@/app/(app)/settings/actions';
import { logEvent } from '@/lib/logger'; // Import logger
import { type UserSettingsData, userSettingsSchema, defaultUserSettings } from '@/lib/user-settings';


const userSchema = z.object({
  id: z.union([z.string().uuid(), z.literal('owner_root')]).describe("Unique user ID or 'owner_root' for the system owner."),
  username: z.string().min(3, "Username must be at least 3 characters long.")
            .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens."),
  hashedPassword: z.string(),
  salt: z.string(),
  role: z.enum(["Administrator", "Admin", "Custom", "Owner"]),
  projects: z.array(z.string().uuid().or(z.string().startsWith("project_"))).optional().default([]), // Allow existing string IDs for projects
  assignedPages: z.array(z.string()).optional().default([]),
  allowedSettingsPages: z.array(z.string()).optional().default([]),
  lastLogin: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type UserData = z.infer<typeof userSchema>;

const addUserInputSchema = userSchema.omit({
    id: true, hashedPassword: true, salt: true, createdAt: true, updatedAt: true, lastLogin: true, role: true
}).extend({
    password: z.string().min(8, "Password must be at least 8 characters long."),
    role: z.enum(["Administrator", "Admin", "Custom"]), 
});

const updateUserInputSchema = userSchema.omit({
    hashedPassword: true, salt: true, createdAt: true, updatedAt: true, lastLogin: true, role: true
}).extend({
    password: z.string().min(8, "Password must be at least 8 characters long.").optional().or(z.literal('')),
    role: z.enum(["Administrator", "Admin", "Custom"]), 
}).required({ id: true });

export type AddUserInput = z.infer<typeof addUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type UserInput = AddUserInput | UpdateUserInput;


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

export interface LoadUsersState {
  users?: UserData[];
  error?: string;
  status: "success" | "error";
}
export interface UserActionState {
  message: string;
  status: "success" | "error" | "idle";
  errors?: Partial<Record<keyof UserInput | "_form", string[]>>;
  user?: UserData;
}

function getUserFilePath(username: string, role: UserData["role"]): string {
  const dataPath = getDataPath();
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${safeUsername}-${safeRole}.json`;
  return path.join(dataPath, filename);
}

// Helper to get current user's debugMode (or global if not available)
async function getCurrentUserDebugMode(sessionUsername?: string, sessionRole?: string): Promise<boolean> {
    if (sessionUsername && sessionRole) {
        try {
            const safeUsername = sessionUsername.replace(/[^a-zA-Z0-9_.-]/g, '_');
            const safeRole = sessionRole.replace(/[^a-zA-Z0-9]/g, '_');
            const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;
            const userSettingsData = await loadEncryptedData(settingsFilename) as UserSettingsData | null;
            if (userSettingsData) return userSettingsData.debugMode;
        } catch { /* Fall through */ }
    }
    // Fallback to global settings' debugMode is difficult as global settings no longer store it.
    // Default to false if user-specific debugMode can't be found.
    return false;
}


export async function ensureOwnerFileExists(ownerUsername: string, ownerPasswordPlain: string, panelSettings?: PanelSettingsData): Promise<void> {
    // User-specific debugMode isn't applicable here as this function can be called before session
    const debugMode = false; // Keep this specific function's logging minimal
    if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Ensuring file for Owner: ${ownerUsername}`);

    const safeOwnerUsername = ownerUsername.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ownerFilename = `${safeOwnerUsername}-Owner.json`;
    const ownerFilePath = path.join(getDataPath(), ownerFilename);

    let existingOwnerData: Partial<UserData> = {};
    try {
      if (fs.existsSync(ownerFilePath)) { // Node.js fs, not fs/promises for sync check
        const loaded = await loadEncryptedData(ownerFilename);
        if (loaded) existingOwnerData = loaded as UserData;
        if(debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Loaded existing owner file for ${ownerUsername}. Preserving createdAt: ${existingOwnerData.createdAt}`);
      }
    } catch (e) {
        console.error(`[RolesActions - ensureOwnerFileExists] Error loading existing owner file ${ownerFilename}, will create anew:`, e);
    }
    
    const { hash, salt } = await hashPassword(ownerPasswordPlain);
    const now = new Date().toISOString();

    const ownerData: UserData = {
        id: 'owner_root',
        username: ownerUsername,
        hashedPassword: hash,
        salt: salt,
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
        if(debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Preparing to save owner data to ${ownerFilename}:`, {id: ownerData.id, username: ownerData.username, role: ownerData.role});
        await saveEncryptedData(ownerFilename, ownerData);
        if(debugMode) {
            console.log(`[RolesActions - ensureOwnerFileExists] Successfully called saveEncryptedData for ${ownerFilename}.`);
            if (fs.existsSync(ownerFilePath)) {
                console.log(`[RolesActions - ensureOwnerFileExists] VERIFIED: Owner file ${ownerFilename} exists at ${ownerFilePath} after save.`);
            } else {
                console.error(`[RolesActions - ensureOwnerFileExists] CRITICAL VERIFICATION FAILURE: Owner file ${ownerFilename} DOES NOT EXIST at ${ownerFilePath} after save.`);
            }
        }
    } catch (e) {
        console.error(`[RolesActions - ensureOwnerFileExists] CRITICAL: Failed to save owner file ${ownerFilename}:`, e);
        throw e; 
    }
}


export async function loadUsers(): Promise<LoadUsersState> {
  const debugMode = false; // Keep this general function's logging minimal
  if (debugMode) console.log("[RolesActions - loadUsers] Attempting to load users from individual files...");

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
    // Match user files like username-Role.json but not username-Role-Auth.json or username-Role-settings.json
    if (file.endsWith('.json') && !file.includes('-Auth.json') && !file.includes('-settings.json') && file !== '.settings.json') {
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            if (parsedUser.data.id !== 'owner_root') { // Exclude owner from regular user list
              users.push(parsedUser.data);
            }
          } else {
            if (debugMode) console.warn(`[RolesActions - loadUsers] Failed to parse user file ${file}:`, parsedUser.error.flatten().fieldErrors);
          }
        }
      } catch (e) {
        console.error(`[RolesActions - loadUsers] Error loading or decrypting user file ${file}:`, e);
      }
    }
  }
  if (debugMode) console.log(`[RolesActions - loadUsers] Successfully loaded ${users.length} non-owner users.`);
  return { users, status: "success" };
}

export async function loadUserById(userId: string): Promise<UserData | null> {
  const debugMode = false; // Keep this general function's logging minimal
  if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load user ID: ${userId}`);
  const dataPath = getDataPath();
  
  if (userId === 'owner_root') {
    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    if (!ownerUsernameEnv) {
      if (debugMode) console.error("[RolesActions - loadUserById] OWNER_USERNAME not set, cannot load owner_root by ID.");
      return null;
    }
    const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ownerFilename = `${safeOwnerUsername}-Owner.json`;
    if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load owner_root from: ${ownerFilename}`);
    try {
      const fileData = await loadEncryptedData(ownerFilename);
      if (fileData) {
        const parsedUser = userSchema.safeParse(fileData);
        if (parsedUser.success && parsedUser.data.id === 'owner_root') {
          if (debugMode) console.log(`[RolesActions - loadUserById] Successfully loaded owner_root from ${ownerFilename}`);
          return parsedUser.data;
        }
      }
    } catch (e) { /* ignore error, will return null */ }
    if (debugMode) console.log(`[RolesActions - loadUserById] Failed to load owner_root from ${ownerFilename}.`);
    return null; 
  }

  let files: string[];
  try {
    files = await fs.readdir(dataPath);
  } catch(e) {
    if (debugMode) console.warn(`[RolesActions - loadUserById] Error reading data directory for user ID ${userId}:`, e);
    return null;
  }

  for (const file of files) {
    if (file.endsWith('.json') && !file.includes('-Auth.json') && !file.includes('-settings.json') && file !== '.settings.json') {
      // Skip the owner file if we know the owner's username
      const ownerUsernameEnv = process.env.OWNER_USERNAME;
      if (ownerUsernameEnv) {
          const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
          if (file === `${safeOwnerUsername}-Owner.json`) continue;
      }
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success && parsedUser.data.id === userId) {
            if (debugMode) console.log(`[RolesActions - loadUserById] Found user ID ${userId} in file ${file}`);
            return parsedUser.data;
          }
        }
      } catch (e) { /* ignore */ }
    }
  }
  if (debugMode) console.log(`[RolesActions - loadUserById] User ID ${userId} not found in any user file.`);
  return null;
}

// Assumes actor is available from session in a real app. Here, it's passed or defaulted.
async function getActorInfo(actor?: { username: string; role: string }): Promise<{ actorUsername: string; actorRole: string }> {
    return {
        actorUsername: actor?.username || 'System',
        actorRole: actor?.role || 'System'
    };
}

export async function addUser(
    prevState: UserActionState, 
    userInput: AddUserInput, 
    actor?: { username: string; role: string } // Actor performing the action
): Promise<UserActionState> {
  const { actorUsername, actorRole } = await getActorInfo(actor);
  const debugMode = await getCurrentUserDebugMode(actorUsername, actorRole);

  if (debugMode) console.log("[RolesActions - addUser] Attempting to add user:", userInput.username, "by", actorUsername);
  const now = new Date().toISOString();

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  if (ownerUsernameEnv && userInput.username === ownerUsernameEnv) {
    logEvent(actorUsername, actorRole, 'ADD_USER_FAILED_OWNER_USERNAME', 'WARN', { targetUser: userInput.username });
    return {
      message: "Cannot add a user with the same username as the Owner.",
      status: "error",
      errors: { username: ["This username is reserved for the Owner account."] }
    };
  }

  const validatedFields = addUserInputSchema.safeParse(userInput);
  if (!validatedFields.success) {
    if (debugMode) console.error("[RolesActions - addUser] Add user validation failed:", validatedFields.error.flatten().fieldErrors);
    logEvent(actorUsername, actorRole, 'ADD_USER_VALIDATION_FAILED', 'WARN', { targetUser: userInput.username, errors: validatedFields.error.flatten().fieldErrors });
    return {
      message: "Validation failed for new user.", status: "error", errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { password, ...userDataToStore } = validatedFields.data;

  try {
    const usersResult = await loadUsers(); // Check against existing users
    if (usersResult.users && usersResult.users.some(u => u.username === userDataToStore.username)) {
      logEvent(actorUsername, actorRole, 'ADD_USER_FAILED_USERNAME_EXISTS', 'WARN', { targetUser: userDataToStore.username });
      return { message: "Username already exists.", status: "error", errors: { username: ["Username already taken"] } };
    }

    const { hash, salt } = await hashPassword(password);
    const newUser: UserData = {
      id: uuidv4(),
      ...userDataToStore,
      role: userInput.role, 
      hashedPassword: hash,
      salt: salt,
      createdAt: now,
      updatedAt: now,
      lastLogin: undefined,
    };

    const filename = path.basename(getUserFilePath(newUser.username, newUser.role));
    await saveEncryptedData(filename, newUser);
    // Also create default user-specific settings file
    const settingsFilename = `${newUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${newUser.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
    await saveEncryptedData(settingsFilename, defaultUserSettings);


    logEvent(actorUsername, actorRole, 'ADD_USER_SUCCESS', 'INFO', { targetUser: newUser.username, targetRole: newUser.role });
    const successMessage = debugMode
        ? `User "${newUser.username}" added successfully to ${filename}.`
        : `User "${newUser.username}" added successfully.`;
    return { message: successMessage, status: "success", user: newUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[RolesActions - addUser] Error adding user:", error);
    logEvent(actorUsername, actorRole, 'ADD_USER_EXCEPTION', 'ERROR', { targetUser: userInput.username, error: error.message });
    return { message: `Error adding user: ${error.message}`, status: "error" };
  }
}

export async function updateUser(
    prevState: UserActionState, 
    userInput: UpdateUserInput,
    actor?: { username: string; role: string } // Actor performing the action
): Promise<UserActionState> {
  const { actorUsername, actorRole } = await getActorInfo(actor);
  const debugMode = await getCurrentUserDebugMode(actorUsername, actorRole);

  if (debugMode) console.log(`[RolesActions - updateUser] Attempting to update user ID: ${userInput.id} by ${actorUsername}`);

  if (userInput.id === 'owner_root') {
     // Owner's core details (username, password, role) are managed via .env and login flow.
     // Only allow updating specific assignable fields for owner if needed.
     const ownerData = await loadUserById('owner_root');
     if (!ownerData) {
        logEvent(actorUsername, actorRole, 'UPDATE_USER_OWNER_NOT_FOUND', 'ERROR');
        return { message: "Owner data file not found. Cannot update owner settings.", status: "error" };
     }
     ownerData.assignedPages = userInput.assignedPages !== undefined ? userInput.assignedPages : ownerData.assignedPages;
     ownerData.allowedSettingsPages = userInput.allowedSettingsPages !== undefined ? userInput.allowedSettingsPages : ownerData.allowedSettingsPages;
     ownerData.projects = userInput.projects !== undefined ? userInput.projects : ownerData.projects;
     ownerData.status = userInput.status || ownerData.status; 
     ownerData.updatedAt = new Date().toISOString();
     
     const ownerFilename = path.basename(getUserFilePath(ownerData.username, ownerData.role));
     await saveEncryptedData(ownerFilename, ownerData);
     logEvent(actorUsername, actorRole, 'UPDATE_USER_OWNER_SETTINGS_SUCCESS', 'INFO', { targetUser: ownerData.username });
     return { message: "Owner restricted settings updated successfully.", status: "success", user: ownerData };
  }

  const validatedChanges = updateUserInputSchema.safeParse(userInput);
  if (!validatedChanges.success) {
    if (debugMode) console.error("[RolesActions - updateUser] Update user validation failed:", validatedChanges.error.flatten().fieldErrors);
    logEvent(actorUsername, actorRole, 'UPDATE_USER_VALIDATION_FAILED', 'WARN', { targetUserId: userInput.id, errors: validatedChanges.error.flatten().fieldErrors });
    return {
      message: "Validation failed for user update.", status: "error", errors: validatedChanges.error.flatten().fieldErrors,
    };
  }

  const { password: newPassword, ...updatesToApply } = validatedChanges.data;
  const now = new Date().toISOString();

  try {
    const currentUserData = await loadUserById(userInput.id);
    if (!currentUserData || currentUserData.id === 'owner_root') { // Should be caught by above, but defensive
      logEvent(actorUsername, actorRole, 'UPDATE_USER_NOT_FOUND', 'ERROR', { targetUserId: userInput.id });
      return { message: "User not found for update.", status: "error", errors: { _form: ["User to update not found."] } };
    }
    const oldFilename = path.basename(getUserFilePath(currentUserData.username, currentUserData.role));
    const oldSettingsFilename = `${currentUserData.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${currentUserData.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;


    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
      if (updatesToApply.username === process.env.OWNER_USERNAME) {
        logEvent(actorUsername, actorRole, 'UPDATE_USER_FAILED_OWNER_USERNAME_CONFLICT', 'WARN', { targetUserId: userInput.id, newUsername: updatesToApply.username });
        return { message: "Cannot change username to Owner's username.", status: "error", errors: { username: ["This username is reserved."] }};
      }
      const usersResult = await loadUsers();
      if (usersResult.users && usersResult.users.some(u => u.username === updatesToApply.username && u.id !== userInput.id)) {
        logEvent(actorUsername, actorRole, 'UPDATE_USER_FAILED_USERNAME_EXISTS', 'WARN', { targetUserId: userInput.id, newUsername: updatesToApply.username });
        return { message: "New username already exists.", status: "error", errors: { username: ["New username is already taken."] } };
      }
    }

    const updatedUser: UserData = {
      ...currentUserData,
      ...updatesToApply,
      role: userInput.role, 
      updatedAt: now,
    };

    if (newPassword && newPassword.length > 0) {
      const { hash, salt } = await hashPassword(newPassword);
      updatedUser.hashedPassword = hash;
      updatedUser.salt = salt;
    }
    
    const newFilenameBase = updatedUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const newRoleBase = updatedUser.role.replace(/[^a-zA-Z0-9]/g, '_');
    const newFilename = `${newFilenameBase}-${newRoleBase}.json`;
    const newSettingsFilename = `${newFilenameBase}-${newRoleBase}-settings.json`;

    // If username or role changed, old file needs to be deleted after new one is saved
    if (oldFilename !== newFilename) {
      await saveEncryptedData(newFilename, updatedUser); // Save new data file first
      // If settings file exists under old name, rename/move it
      const dataPath = getDataPath();
      const oldSettingsPath = path.join(dataPath, oldSettingsFilename);
      const newSettingsPath = path.join(dataPath, newSettingsFilename);
      if (fs.existsSync(oldSettingsPath)) {
          try {
              await fs.rename(oldSettingsPath, newSettingsPath);
              if (debugMode) console.log(`[RolesActions - updateUser] Renamed settings file from ${oldSettingsFilename} to ${newSettingsFilename}`);
          } catch (renameError) {
              console.warn(`[RolesActions - updateUser] Could not rename settings file ${oldSettingsFilename} to ${newSettingsFilename}. User might lose settings. Error: ${renameError}`);
              // If rename fails, new user might lose settings or get defaults on next login.
          }
      }
      try {
        await fs.unlink(path.join(dataPath, oldFilename));
        if (debugMode) console.log(`[RolesActions - updateUser] Deleted old user file: ${oldFilename}`);
      } catch (e) {
        console.warn(`[RolesActions - updateUser] Could not delete old user file ${oldFilename} after rename:`, e);
      }
    } else {
      await saveEncryptedData(newFilename, updatedUser); // Just save to the same file
    }
    logEvent(actorUsername, actorRole, 'UPDATE_USER_SUCCESS', 'INFO', { targetUserId: updatedUser.id, targetUsername: updatedUser.username });
    const successMessage = debugMode
        ? `User "${updatedUser.username}" updated successfully in ${newFilename}.`
        : `User "${updatedUser.username}" updated successfully.`;
    return { message: successMessage, status: "success", user: updatedUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions - updateUser] Error updating user ID ${userInput.id}:`, error);
    logEvent(actorUsername, actorRole, 'UPDATE_USER_EXCEPTION', 'ERROR', { targetUserId: userInput.id, error: error.message });
    return { message: `Error updating user: ${error.message}`, status: "error" };
  }
}


export async function deleteUser(
    userId: string,
    actor?: { username: string; role: string } // Actor performing the action
): Promise<UserActionState> {
  const { actorUsername, actorRole } = await getActorInfo(actor);
  const debugMode = await getCurrentUserDebugMode(actorUsername, actorRole);

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
    if (!userToDelete || userToDelete.id === 'owner_root') { // Defensive check
      logEvent(actorUsername, actorRole, 'DELETE_USER_NOT_FOUND', 'ERROR', { targetUserId: userId });
      return { message: "User not found for deletion or user data is invalid.", status: "error" };
    }

    const filenameToDelete = path.basename(getUserFilePath(userToDelete.username, userToDelete.role));
    const settingsFilenameToDelete = `${userToDelete.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${userToDelete.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
    const dataPath = getDataPath();

    try {
      await fs.unlink(path.join(dataPath, filenameToDelete));
      if (debugMode) console.log(`[RolesActions - deleteUser] Deleted user file: ${filenameToDelete}`);
    } catch (e) {
       if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
         if (debugMode) console.warn(`[RolesActions - deleteUser] User file not found, assuming already deleted: ${filenameToDelete}`);
       } else { throw e; }
    }
    try {
      await fs.unlink(path.join(dataPath, settingsFilenameToDelete));
      if (debugMode) console.log(`[RolesActions - deleteUser] Deleted user settings file: ${settingsFilenameToDelete}`);
    } catch (e) {
       if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
         // This is fine, user might not have had specific settings saved yet
         if (debugMode) console.warn(`[RolesActions - deleteUser] User settings file not found, assuming not created: ${settingsFilenameToDelete}`);
       } else { 
            console.warn(`[RolesActions - deleteUser] Could not delete user settings file ${settingsFilenameToDelete}. It might need manual cleanup. Error: ${e}`);
            // Don't fail the whole delete if settings file deletion fails, but log it.
       }
    }


    logEvent(actorUsername, actorRole, 'DELETE_USER_SUCCESS', 'INFO', { targetUserId: userId, targetUsername: userToDelete.username });
    const successMessage = debugMode
        ? `User "${userToDelete.username}" (file: ${filenameToDelete}) deleted successfully.`
        : `User deleted successfully.`;
    return { message: successMessage, status: "success" };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions - deleteUser] Error deleting user ID ${userId}:`, error);
    logEvent(actorUsername, actorRole, 'DELETE_USER_EXCEPTION', 'ERROR', { targetUserId: userId, error: error.message });
    return { message: `Error deleting user: ${error.message}`, status: "error" };
  }
}
