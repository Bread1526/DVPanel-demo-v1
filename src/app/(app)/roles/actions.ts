
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
  id: z.string().uuid(),
  username: z.string().min(3, "Username must be at least 3 characters long.")
            .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens."),
  hashedPassword: z.string(),
  salt: z.string(),
  role: z.enum(["Administrator", "Admin", "Custom", "Owner"]), // Added Owner for schema completeness
  projects: z.array(z.string()).optional().default([]),
  assignedPages: z.array(z.string()).optional().default([]),
  allowedSettingsPages: z.array(z.string()).optional().default([]),
  lastLogin: z.string().datetime().optional(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserData = z.infer<typeof userSchema>;

// Input type for adding or updating a user (password is optional for updates)
export type UserInput = Omit<UserData, "id" | "hashedPassword" | "salt" | "createdAt" | "updatedAt" | "lastLogin"> & {
  password?: string;
  id?: string; // For updates
  status?: "Active" | "Inactive";
};

// Password Hashing Utilities
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

// State types for server actions
export interface LoadUsersState {
  users?: UserData[];
  error?: string;
  status: "success" | "error"; 
}
export interface UserActionState {
  message: string;
  status: "success" | "error"; 
  errors?: Partial<Record<keyof UserInput | "_form", string[]>>;
  user?: UserData; 
}

// Helper to get user file path
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

// --- Server Actions ---

export async function loadUsers(): Promise<LoadUsersState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  if (debugMode) console.log("[RolesActions] Attempting to load users from individual files...");

  const dataPath = getDataPath();
  const users: UserData[] = [];
  let files: string[];

  try {
    files = await fs.readdir(dataPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      if (debugMode) console.log("[RolesActions] Data directory not found. Returning empty list.");
      return { users: [], status: "success" };
    }
    console.error("[RolesActions] Error reading data directory:", e);
    return { error: "Failed to read user data directory.", status: "error" };
  }

  for (const file of files) {
    if (file.match(/^[a-zA-Z0-9_.-]+-[a-zA-Z0-9]+\.json$/) && file !== '.settings.json') { // Ensure to exclude .settings.json
      try {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            users.push(parsedUser.data);
          } else {
            console.warn(`[RolesActions] Failed to parse user file ${file}:`, parsedUser.error.flatten().fieldErrors);
          }
        }
      } catch (e) {
        console.error(`[RolesActions] Error loading or decrypting user file ${file}:`, e);
      }
    }
  }
  if (debugMode) console.log(`[RolesActions] Successfully loaded ${users.length} users.`);
  return { users, status: "success" };
}

export async function addUser(prevState: UserActionState, userInput: UserInput): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  if (debugMode) console.log("[RolesActions] Attempting to add user:", userInput.username);
  const now = new Date().toISOString();

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  if (ownerUsernameEnv && userInput.username === ownerUsernameEnv) {
    return { 
      message: "Cannot add a user with the same username as the Owner.", 
      status: "error", 
      errors: { username: ["This username is reserved for the Owner account."] }
    };
  }

  const validationSchema = userSchema.pick({ 
    username: true, role: true, projects: true, assignedPages: true, allowedSettingsPages: true, status: true 
  }).extend({ 
    password: z.string().min(8, "Password must be at least 8 characters long.") 
  });
  
  const rawData = {
    username: userInput.username,
    password: userInput.password,
    role: userInput.role,
    projects: userInput.projects || [],
    assignedPages: userInput.assignedPages || [],
    allowedSettingsPages: userInput.allowedSettingsPages || [],
    status: userInput.status || "Active",
  };

  const validatedFields = validationSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error("[RolesActions] Add user validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { password, ...userDataToStore } = validatedFields.data;

  try {
    const { users: existingUsers, error: loadError, status: loadStatus } = await loadUsers();
    if (loadStatus === "error" || !existingUsers) {
      return { message: `Failed to load existing users: ${loadError || 'Unknown error'}`, status: "error" };
    }

    if (existingUsers.some(u => u.username === userDataToStore.username)) {
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
    };

    const filePath = getUserFilePath(newUser.username, newUser.role);
    await saveEncryptedData(path.basename(filePath), newUser);
    
    const successMessage = debugMode
        ? `User "${newUser.username}" added successfully to ${path.basename(filePath)}.`
        : `User "${newUser.username}" added successfully.`;

    return { message: successMessage, status: "success", user: newUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[RolesActions] Error adding user:", error);
    return { message: `Error adding user: ${error.message}`, status: "error" };
  }
}

export async function updateUser(prevState: UserActionState, userInput: UserInput): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  const userId = userInput.id;
  if (!userId) {
    return { message: "User ID is missing for update.", status: "error", errors: { _form: ["User ID is required for update."] } };
  }
  if (debugMode) console.log(`[RolesActions] Attempting to update user ID: ${userId}`);
  
  if (userId === 'owner_root' && (userInput.username !== process.env.OWNER_USERNAME || userInput.role !== 'Owner')) {
      return { message: "Owner username and role cannot be changed via UI.", status: "error" };
  }
   if (userId === 'owner_root' && userInput.password) {
      return { message: "Owner password must be changed via .env.local file.", status: "error" };
  }

  const now = new Date().toISOString();

  const updateValidationSchema = userSchema.pick({ 
    username: true, role: true, projects: true, status: true, assignedPages: true, allowedSettingsPages: true 
  }).extend({ 
    password: z.string().min(8, "Password must be at least 8 characters long.").optional().or(z.literal('')) 
  }).partial();

  const validatedChanges = updateValidationSchema.safeParse(userInput);

  if (!validatedChanges.success) {
    console.error("[RolesActions] Update user validation failed:", validatedChanges.error.flatten().fieldErrors);
    return {
      message: "Validation failed for update.",
      status: "error",
      errors: validatedChanges.error.flatten().fieldErrors,
    };
  }
  
  const { password: newPassword, ...updatesToApply } = validatedChanges.data;

  try {
    const { users: allUsers, error: loadError, status: loadStatus } = await loadUsers();
    if (loadStatus === 'error' || !allUsers) {
      return { message: `Failed to load existing users: ${loadError || 'Unknown error'}`, status: "error" };
    }

    const currentUserIndex = allUsers.findIndex(u => u.id === userId);
    if (currentUserIndex === -1) {
      return { message: "User not found for update.", status: "error", errors: { _form: ["User to update not found."] } };
    }
    const currentUserData = allUsers[currentUserIndex];

    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
      if (updatesToApply.username === process.env.OWNER_USERNAME) {
        return { message: "Cannot change username to Owner's username.", status: "error", errors: { username: ["This username is reserved."] }};
      }
      if (allUsers.some(u => u.id !== userId && u.username === updatesToApply.username)) {
        return { message: "New username already exists.", status: "error", errors: { username: ["New username is already taken."] } };
      }
    }
    
    const oldFilePath = getUserFilePath(currentUserData.username, currentUserData.role);

    const updatedUser: UserData = {
      ...currentUserData,
      ...updatesToApply, 
      updatedAt: now,
    };

    if (newPassword) {
      const { hash, salt } = await hashPassword(newPassword);
      updatedUser.hashedPassword = hash;
      updatedUser.salt = salt;
    }

    const newFilePath = getUserFilePath(updatedUser.username, updatedUser.role);

    if (oldFilePath !== newFilePath) {
      try {
        await fs.unlink(oldFilePath);
        if (debugMode) console.log(`[RolesActions] Deleted old user file: ${path.basename(oldFilePath)}`);
      } catch (e) {
        console.warn(`[RolesActions] Could not delete old user file ${path.basename(oldFilePath)}:`, e);
      }
    }
    
    await saveEncryptedData(path.basename(newFilePath), updatedUser);

    const successMessage = debugMode 
        ? `User "${updatedUser.username}" updated successfully in ${path.basename(newFilePath)}.`
        : `User "${updatedUser.username}" updated successfully.`;

    return { message: successMessage, status: "success", user: updatedUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions] Error updating user ID ${userId}:`, error);
    return { message: `Error updating user: ${error.message}`, status: "error" };
  }
}


export async function deleteUser(userId: string): Promise<UserActionState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;
  if (debugMode) console.log(`[RolesActions] Attempting to delete user ID: ${userId}`);

  if (!userId) {
    return { message: "User ID is required for deletion.", status: "error" };
  }
  if (userId === 'owner_root') {
    return { message: "Owner account cannot be deleted via UI.", status: "error" };
  }

  try {
    const { users: allUsers, error: loadError, status: loadStatus } = await loadUsers();
    if (loadStatus === 'error' || !allUsers) {
      return { message: `Failed to load existing users: ${loadError || 'Unknown error'}`, status: "error" };
    }

    const userToDelete = allUsers.find(u => u.id === userId);
    if (!userToDelete) {
      return { message: "User not found for deletion.", status: "error" };
    }
    
    if (userToDelete.username === process.env.OWNER_USERNAME && userToDelete.role === 'Owner') {
         return { message: "Owner account cannot be deleted.", status: "error" };
    }

    const filePath = getUserFilePath(userToDelete.username, userToDelete.role);
    try {
      await fs.unlink(filePath);
    } catch (e) {
       if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
         if (debugMode) console.warn(`[RolesActions] File not found for user ${userToDelete.username}, assuming already deleted.`);
       } else {
         throw e; 
       }
    }
    
    const successMessage = debugMode
        ? `User "${userToDelete.username}" (file: ${path.basename(filePath)}) deleted successfully.`
        : `User deleted successfully.`;
        
    return { message: successMessage, status: "success" };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions] Error deleting user ID ${userId}:`, error);
    return { message: `Error deleting user: ${error.message}`, status: "error" };
  }
}
