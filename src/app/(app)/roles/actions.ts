'use server';

import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs/promises'; 
import { type PanelSettingsData, loadPanelSettings as loadGeneralPanelSettings } from '@/app/(app)/settings/actions';

const userSchema = z.object({
  id: z.union([z.string().uuid(), z.literal('owner_root')]).describe("Unique user ID or 'owner_root' for the system owner."),
  username: z.string().min(3, "Username must be at least 3 characters long.")
            .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens."),
  hashedPassword: z.string(),
  salt: z.string(),
  role: z.enum(["Administrator", "Admin", "Custom", "Owner"]),
  projects: z.array(z.string()).optional().default([]),
  assignedPages: z.array(z.string()).optional().default([]),
  allowedSettingsPages: z.array(z.string()).optional().default([]),
  lastLogin: z.string().datetime().optional(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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

async function getPanelSettingsForDebug(): Promise<PanelSettingsData | undefined> {
    try {
        const settingsResult = await loadGeneralPanelSettings();
        return settingsResult.data;
    } catch {
        return undefined;
    }
}

export async function ensureOwnerFileExists(ownerUsername: string, ownerPasswordPlain: string, panelSettings?: PanelSettingsData): Promise<void> {
    const debugMode = panelSettings?.debugMode ?? false;
    if (debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Ensuring file for Owner: ${ownerUsername}`);

    const safeOwnerUsername = ownerUsername.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ownerFilename = `${safeOwnerUsername}-Owner.json`;
    const ownerFilePath = path.join(getDataPath(), ownerFilename);

    if (debugMode) {
        console.log(`[RolesActions - ensureOwnerFileExists] Target owner file: ${ownerFilePath}`);
    }

    let existingOwnerData: Partial<UserData> = {};
    if (fs.existsSync(ownerFilePath)) {
        try {
            const loaded = await loadEncryptedData(ownerFilename);
            if (loaded) existingOwnerData = loaded as UserData;
            if(debugMode) console.log(`[RolesActions - ensureOwnerFileExists] Loaded existing owner file for ${ownerUsername}. Preserving createdAt: ${existingOwnerData.createdAt}`);
        } catch (e) {
            console.error(`[RolesActions - ensureOwnerFileExists] Error loading existing owner file ${ownerFilename}, will create anew:`, e);
        }
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
        lastLogin: now, // Update lastLogin on this operation
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
        throw e; // Re-throw to indicate failure
    }
}


export async function loadUsers(): Promise<LoadUsersState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
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
    if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json')) {
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            // Filter out the owner record if it's loaded from its file, as it's handled specially.
            if (parsedUser.data.id !== 'owner_root') {
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
  if (debugMode) console.log(`[RolesActions - loadUsers] Successfully loaded ${users.length} non-owner users from individual files.`);
  return { users, status: "success" };
}

export async function loadUserById(userId: string): Promise<UserData | null> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load user ID: ${userId}`);

  const dataPath = getDataPath();
  
  // Handle Owner loading directly
  if (userId === 'owner_root') {
    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    if (!ownerUsernameEnv) {
      if (debugMode) console.error("[RolesActions - loadUserById] OWNER_USERNAME not set in .env, cannot load owner_root by ID.");
      return null;
    }
    const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ownerFilename = `${safeOwnerUsername}-Owner.json`;
    const ownerFilePath = path.join(dataPath, ownerFilename);

    if (debugMode) console.log(`[RolesActions - loadUserById] Attempting to load owner_root from specific file: ${ownerFilename}`);
    try {
      const fileData = await loadEncryptedData(ownerFilename);
      if (fileData) {
        const parsedUser = userSchema.safeParse(fileData);
        if (parsedUser.success && parsedUser.data.id === 'owner_root') {
          if (debugMode) console.log(`[RolesActions - loadUserById] Successfully loaded owner_root from ${ownerFilename}`);
          return parsedUser.data;
        } else if (!parsedUser.success) {
          if (debugMode) console.warn(`[RolesActions - loadUserById] Owner file ${ownerFilename} parsed with errors:`, parsedUser.error.flatten().fieldErrors);
        } else {
            if (debugMode) console.warn(`[RolesActions - loadUserById] Owner file ${ownerFilename} loaded, but ID was not 'owner_root'. Data:`, parsedUser.data);
        }
      } else {
        if(debugMode) console.log(`[RolesActions - loadUserById] Owner file ${ownerFilename} not found or empty when trying to load owner_root.`);
      }
    } catch (e) {
      if (debugMode) console.error(`[RolesActions - loadUserById] Error loading owner_root file ${ownerFilename}:`, e);
    }
    if(debugMode) console.log(`[RolesActions - loadUserById] Failed to load owner_root from specific file. It might not have been created yet.`);
    return null; // Owner file not found or invalid
  }

  // Handle regular users by scanning files
  let files: string[];
  try {
    files = await fs.readdir(dataPath);
  } catch(e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        if (debugMode) console.warn(`[RolesActions - loadUserById] Data directory not found when searching for user ID ${userId}.`);
    } else {
        if (debugMode) console.warn(`[RolesActions - loadUserById] Error reading data directory for user ID ${userId}:`, e);
    }
    return null;
  }

  for (const file of files) {
    if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json')) {
      // Avoid trying to load the owner file again if it was already attempted and failed or for a different owner
      const ownerUsernameEnv = process.env.OWNER_USERNAME;
      if (ownerUsernameEnv) {
          const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const ownerFilenamePattern = `${safeOwnerUsername}-Owner.json`;
          if (file === ownerFilenamePattern) continue; // Skip the main owner file, it's handled above
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
      } catch (e) {
        if (debugMode) console.error(`[RolesActions - loadUserById] Error processing file ${file} for user ID ${userId}:`, e);
      }
    }
  }
  if (debugMode) console.log(`[RolesActions - loadUserById] User ID ${userId} not found in any user file.`);
  return null;
}


export async function addUser(prevState: UserActionState, userInput: AddUserInput): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  if (debugMode) console.log("[RolesActions - addUser] Attempting to add user:", userInput.username);
  const now = new Date().toISOString();

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  if (ownerUsernameEnv && userInput.username === ownerUsernameEnv) {
    return {
      message: "Cannot add a user with the same username as the Owner.",
      status: "error",
      errors: { username: ["This username is reserved for the Owner account."] }
    };
  }

  const validatedFields = addUserInputSchema.safeParse(userInput);

  if (!validatedFields.success) {
    if (debugMode) console.error("[RolesActions - addUser] Add user validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed for new user.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { password, ...userDataToStore } = validatedFields.data;

  try {
    const dataPath = getDataPath();
    let existingFiles: string[];
    try { existingFiles = await fs.readdir(dataPath); } catch { existingFiles = []; }

    for (const file of existingFiles) {
        if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json')) {
            const fileData = await loadEncryptedData(file);
            if (fileData) {
                const existingUser = userSchema.safeParse(fileData);
                if (existingUser.success && existingUser.data.username === userDataToStore.username) {
                    return { message: "Username already exists.", status: "error", errors: { username: ["Username already taken"] } };
                }
            }
        }
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

    const successMessage = debugMode
        ? `User "${newUser.username}" added successfully to ${filename}.`
        : `User "${newUser.username}" added successfully.`;

    return { message: successMessage, status: "success", user: newUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[RolesActions - addUser] Error adding user:", error);
    return { message: `Error adding user: ${error.message}`, status: "error" };
  }
}

export async function updateUser(prevState: UserActionState, userInput: UpdateUserInput): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  if (debugMode) console.log(`[RolesActions - updateUser] Attempting to update user ID: ${userInput.id}`);

  if (userInput.id === 'owner_root') {
     if (debugMode) console.warn("[RolesActions - updateUser] Attempt to update owner_root user directly.");
     const ownerUsernameEnv = process.env.OWNER_USERNAME;
     if (!ownerUsernameEnv) return { message: "Owner username not configured in .env", status: "error" };
     
     const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
     const ownerFilename = `${safeOwnerUsername}-Owner.json`;
     
     try {
        let ownerData = await loadEncryptedData(ownerFilename) as UserData | null;
        if (!ownerData || ownerData.id !== 'owner_root') {
            return { message: "Owner data file not found or invalid. Cannot update owner settings.", status: "error" };
        }
        
        // Only allow updating specific fields for owner via this UI route
        ownerData.assignedPages = userInput.assignedPages !== undefined ? userInput.assignedPages : ownerData.assignedPages;
        ownerData.allowedSettingsPages = userInput.allowedSettingsPages !== undefined ? userInput.allowedSettingsPages : ownerData.allowedSettingsPages;
        ownerData.projects = userInput.projects !== undefined ? userInput.projects : ownerData.projects; // Allow project assignment for owner if needed
        ownerData.status = userInput.status || ownerData.status; 
        ownerData.updatedAt = new Date().toISOString();
        
        // Owner's username, role, password cannot be changed here.
        // Username/password sync happens via .env and ensureOwnerFileExists on login.
        if (userInput.username && userInput.username !== ownerData.username) {
             if(debugMode) console.warn("[RolesActions - updateUser] Attempt to change Owner's username via UI was ignored.");
        }
        if (userInput.password) {
            if(debugMode) console.warn("[RolesActions - updateUser] Attempt to change Owner's password via UI was ignored. Use .env.");
        }
        
        await saveEncryptedData(ownerFilename, ownerData);
        return { message: "Owner restricted settings (like page/project assignments, status) updated successfully.", status: "success", user: ownerData };

     } catch(e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`[RolesActions - updateUser] Error updating owner_root details:`, error);
        return { message: `Error updating owner details: ${error.message}`, status: "error" };
     }
  }

  const validatedChanges = updateUserInputSchema.safeParse(userInput);

  if (!validatedChanges.success) {
    if (debugMode) console.error("[RolesActions - updateUser] Update user validation failed:", validatedChanges.error.flatten().fieldErrors);
    return {
      message: "Validation failed for user update.",
      status: "error",
      errors: validatedChanges.error.flatten().fieldErrors,
    };
  }

  const { password: newPassword, ...updatesToApply } = validatedChanges.data;
  const now = new Date().toISOString();

  try {
    const dataPath = getDataPath();
    let files: string[];
    try { files = await fs.readdir(dataPath); } catch { files = []; }
    
    let currentUserData: UserData | null = null;
    let oldFilename: string | null = null;

    for (const file of files) {
      if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json')) {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsed = userSchema.safeParse(fileData);
          if (parsed.success && parsed.data.id === userInput.id && parsed.data.id !== 'owner_root') { 
            currentUserData = parsed.data;
            oldFilename = file;
            break;
          }
        }
      }
    }

    if (!currentUserData || !oldFilename) {
      return { message: "User not found for update.", status: "error", errors: { _form: ["User to update not found."] } };
    }

    const oldFilePath = path.join(dataPath, oldFilename);

    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
      if (updatesToApply.username === process.env.OWNER_USERNAME) {
        return { message: "Cannot change username to Owner's username.", status: "error", errors: { username: ["This username is reserved."] }};
      }
      for (const file of files) {
          if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json') && file !== oldFilename) { 
              const fileData = await loadEncryptedData(file);
              if (fileData) {
                  const existingUser = userSchema.safeParse(fileData);
                  if (existingUser.success && existingUser.data.username === updatesToApply.username) {
                      return { message: "New username already exists.", status: "error", errors: { username: ["New username is already taken."] } };
                  }
              }
          }
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
    
    const safeNewUsername = updatedUser.username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeNewRole = updatedUser.role.replace(/[^a-zA-Z0-9]/g, '_');
    const newFilename = `${safeNewUsername}-${safeNewRole}.json`;


    if (oldFilename !== newFilename && oldFilePath) {
      try {
        await fs.unlink(oldFilePath);
        if (debugMode) console.log(`[RolesActions - updateUser] Deleted old user file: ${oldFilename}`);
      } catch (e) {
        console.warn(`[RolesActions - updateUser] Could not delete old user file ${oldFilename}:`, e);
      }
    }

    await saveEncryptedData(newFilename, updatedUser);

    const successMessage = debugMode
        ? `User "${updatedUser.username}" updated successfully in ${newFilename}.`
        : `User "${updatedUser.username}" updated successfully.`;

    return { message: successMessage, status: "success", user: updatedUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions - updateUser] Error updating user ID ${userInput.id}:`, error);
    return { message: `Error updating user: ${error.message}`, status: "error" };
  }
}


export async function deleteUser(userId: string): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  if (debugMode) console.log(`[RolesActions - deleteUser] Attempting to delete user ID: ${userId}`);

  if (!userId) {
    return { message: "User ID is required for deletion.", status: "error" };
  }
  if (userId === 'owner_root') {
    return { message: "Owner account cannot be deleted.", status: "error" };
  }

  try {
    const dataPath = getDataPath();
    let files: string[];
    try { files = await fs.readdir(dataPath); } catch { files = []; }
    
    let userToDelete: UserData | null = null;
    let filePathToDelete: string | null = null;
    let filenameToDelete: string | null = null;

    for (const file of files) {
       if (file.endsWith('.json') && file !== '.settings.json' && !file.endsWith('-Auth.json')) {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success && parsedUser.data.id === userId) {
            userToDelete = parsedUser.data;
            filenameToDelete = file;
            filePathToDelete = path.join(dataPath, file);
            break;
          } else if (!parsedUser.success && (fileData as any).id === userId) {
             if(debugMode) console.warn(`[RolesActions - deleteUser] Found file for ID ${userId} but it failed schema validation: ${file}`, parsedUser.error);
          }
        }
      }
    }

    if (!userToDelete || !filePathToDelete || !filenameToDelete) {
      return { message: "User not found for deletion or user data is invalid.", status: "error" };
    }

    try {
      await fs.unlink(filePathToDelete);
    } catch (e) {
       if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
         if (debugMode) console.warn(`[RolesActions - deleteUser] File not found for user ${userToDelete.username}, assuming already deleted: ${filenameToDelete}`);
       } else {
         throw e; 
       }
    }

    const successMessage = debugMode
        ? `User "${userToDelete.username}" (file: ${filenameToDelete}) deleted successfully.`
        : `User deleted successfully.`;

    return { message: successMessage, status: "success" };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions - deleteUser] Error deleting user ID ${userId}:`, error);
    return { message: `Error deleting user: ${error.message}`, status: "error" };
  }
}