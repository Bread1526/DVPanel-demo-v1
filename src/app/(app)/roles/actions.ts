
"use server";

import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs/promises'; // Using promises API for readdir and unlink
import { type PanelSettingsData, loadPanelSettings as loadGeneralPanelSettings } from '@/app/(app)/settings/actions';

// Schema for individual user data
const userSchema = z.object({
  id: z.union([z.string().uuid(), z.literal('owner_root')]).describe("Unique user ID or 'owner_root' for the system owner."),
  username: z.string().min(3, "Username must be at least 3 characters long.")
            .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens."),
  hashedPassword: z.string(),
  salt: z.string(),
  role: z.enum(["Administrator", "Admin", "Custom", "Owner"]), // Added Owner for file representation
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
    role: z.enum(["Administrator", "Admin", "Custom"]), // Explicitly list creatable roles
});

const updateUserInputSchema = userSchema.omit({
    hashedPassword: true, salt: true, createdAt: true, updatedAt: true, lastLogin: true, role: true
}).extend({
    password: z.string().min(8, "Password must be at least 8 characters long.").optional().or(z.literal('')),
    role: z.enum(["Administrator", "Admin", "Custom"]), // Explicitly list updatable roles
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
    // Match user files (e.g., username-Role.json) but exclude the panel settings file.
    if (file.endsWith('.json') && file !== '.settings.json') {
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            // Filter out the owner record if it's loaded, as it's managed separately
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
  let files: string[];
  try {
    files = await fs.readdir(dataPath);
  } catch {
    return null;
  }

  for (const file of files) {
    if (file.endsWith('.json') && file !== '.settings.json') {
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success && parsedUser.data.id === userId) {
            if (debugMode && parsedUser.data.id === 'owner_root') console.log(`[RolesActions - loadUserById] Loaded owner_root from its file: ${file}`);
            if (debugMode && parsedUser.data.id !== 'owner_root') console.log(`[RolesActions - loadUserById] Found user ID ${userId} in file ${file}`);
            return parsedUser.data;
          }
        }
      } catch (e) {
        if (debugMode) console.error(`[RolesActions - loadUserById] Error processing file ${file}:`, e);
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
    // Check for username uniqueness across all existing user files
    const dataPath = getDataPath();
    let existingFiles: string[];
    try { existingFiles = await fs.readdir(dataPath); } catch { existingFiles = []; }

    for (const file of existingFiles) {
        if (file.endsWith('.json') && file !== '.settings.json') {
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
      role: userInput.role, // Explicitly set from AddUserInput
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
     if (debugMode) console.warn("[RolesActions - updateUser] Attempt to update owner_root user directly. This is highly restricted. Owner details are primarily synced via .env on login.");
     // Allow updating assignedPages and allowedSettingsPages for owner_root
     const ownerUsernameEnv = process.env.OWNER_USERNAME;
     if (!ownerUsernameEnv) return { message: "Owner username not configured in .env", status: "error" };
     
     const ownerFilename = path.basename(getUserFilePath(ownerUsernameEnv, 'Owner'));
     try {
        let ownerData = await loadEncryptedData(ownerFilename) as UserData | null;
        if (!ownerData || ownerData.id !== 'owner_root') {
            return { message: "Owner data file not found or invalid.", status: "error" };
        }
        // Only update specific fields for owner
        ownerData.assignedPages = userInput.assignedPages || ownerData.assignedPages;
        ownerData.allowedSettingsPages = userInput.allowedSettingsPages || ownerData.allowedSettingsPages;
        ownerData.status = userInput.status || ownerData.status;
        ownerData.updatedAt = new Date().toISOString();
        
        await saveEncryptedData(ownerFilename, ownerData);
        return { message: "Owner restricted settings updated successfully.", status: "success", user: ownerData };

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
    let oldFilePath: string | null = null;
    let oldFilename: string | null = null;

    for (const file of files) {
      if (file.endsWith('.json') && file !== '.settings.json') {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsed = userSchema.safeParse(fileData);
          if (parsed.success && parsed.data.id === userInput.id && parsed.data.id !== 'owner_root') { // Ensure not owner_root here
            currentUserData = parsed.data;
            oldFilename = file;
            oldFilePath = path.join(dataPath, file);
            break;
          }
        }
      }
    }

    if (!currentUserData || !oldFilePath || !oldFilename) {
      return { message: "User not found for update.", status: "error", errors: { _form: ["User to update not found."] } };
    }

    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
      if (updatesToApply.username === process.env.OWNER_USERNAME) {
        return { message: "Cannot change username to Owner's username.", status: "error", errors: { username: ["This username is reserved."] }};
      }
      // Check for username uniqueness among other users
      for (const file of files) {
          if (file.endsWith('.json') && file !== '.settings.json' && file !== oldFilename) { // Exclude current user's old file
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
      role: userInput.role, // Explicitly set from UpdateUserInput
      updatedAt: now,
    };

    if (newPassword && newPassword.length > 0) {
      const { hash, salt } = await hashPassword(newPassword);
      updatedUser.hashedPassword = hash;
      updatedUser.salt = salt;
    }

    const newFilename = path.basename(getUserFilePath(updatedUser.username, updatedUser.role));

    if (oldFilename !== newFilename && oldFilePath) {
      try {
        await fs.unlink(oldFilePath);
        if (debugMode) console.log(`[RolesActions - updateUser] Deleted old user file: ${oldFilename}`);
      } catch (e) {
        // Log if deletion fails but continue, as saving new file is more critical
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
       if (file.endsWith('.json') && file !== '.settings.json') {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const potentialUser = fileData as Partial<UserData & {id: string}>; // Ensure id exists
          if (potentialUser.id === userId) {
             const parsed = userSchema.safeParse(fileData);
             if (parsed.success){
                userToDelete = parsed.data;
                filenameToDelete = file;
                filePathToDelete = path.join(dataPath, file);
                break;
             } else {
                if(debugMode) console.warn(`[RolesActions - deleteUser] Found file for ID ${userId} but it failed schema validation: ${file}`, parsed.error);
             }
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
         // If file not found, consider it a success in terms of deletion intent.
       } else {
         throw e; // Re-throw other errors
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
