
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

// Input type for adding or updating a user (password is optional for updates)
// For update, ensure 'id' is present. For add, it's not.
const addUserInputSchema = userSchema.omit({
    id: true, hashedPassword: true, salt: true, createdAt: true, updatedAt: true, lastLogin: true
}).extend({
    password: z.string().min(8, "Password must be at least 8 characters long."),
});

const updateUserInputSchema = userSchema.omit({
    hashedPassword: true, salt: true, createdAt: true, updatedAt: true, lastLogin: true
}).extend({
    password: z.string().min(8, "Password must be at least 8 characters long.").optional().or(z.literal('')), // Allow empty for no change
}).required({ id: true }); // ID is required for updates

export type AddUserInput = z.infer<typeof addUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type UserInput = AddUserInput | UpdateUserInput;


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
  status: "success" | "error" | "idle"; // Added idle for initialFormState
  errors?: Partial<Record<keyof UserInput | "_form", string[]>>;
  user?: UserData;
}

// Helper to get user file path
function getUserFilePath(username: string, role: UserData["role"]): string {
  const dataPath = getDataPath();
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_'); // Sanitize for filename
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
    // Regex to match potential user files, e.g., username-Role.json, excluding .settings.json
    if (file.match(/^[a-zA-Z0-9_.-]+-[a-zA-Z0-9_]+\.json$/) && file !== '.settings.json') {
      try {
        const fileData = await loadEncryptedData(file); // loadEncryptedData expects just filename
        if (fileData) {
          const parsedUser = userSchema.safeParse(fileData);
          if (parsedUser.success) {
            if (parsedUser.data.id === 'owner_root') {
              if (debugMode) console.log(`[RolesActions - loadUsers] Skipping owner_root user: ${parsedUser.data.username} from general list, managed by .env.`);
            } else {
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
      ...userDataToStore, // username, role, projects, assignedPages, allowedSettingsPages, status
      hashedPassword: hash,
      salt: salt,
      createdAt: now,
      updatedAt: now,
      lastLogin: undefined, // New users haven't logged in
    };

    const filePath = getUserFilePath(newUser.username, newUser.role);
    await saveEncryptedData(path.basename(filePath), newUser);

    const successMessage = debugMode
        ? `User "${newUser.username}" added successfully to ${path.basename(filePath)}.`
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
    if (debugMode) console.warn("[RolesActions - updateUser] Attempt to update owner_root user via standard updateUser. This might be restricted.");
    // Owner's username and role are typically fixed by .env. Password changes also special.
    // For now, let's prevent critical changes but allow permissions/status updates.
    if (userInput.username && userInput.username !== process.env.OWNER_USERNAME) {
        return { message: "Owner username cannot be changed via UI.", status: "error", errors: {username: ["Owner username cannot be changed."]}};
    }
    if (userInput.role && userInput.role !== 'Owner') {
        return { message: "Owner role cannot be changed.", status: "error", errors: {role: ["Owner role cannot be changed."]}};
    }
     if (userInput.password && userInput.password.length > 0) { // Password for owner is via .env
        return { message: "Owner password must be changed via .env.local file.", status: "error", errors: {password: ["Owner password change not allowed here."]}};
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
    // Load all users to find the one to update by ID
    const dataPath = getDataPath();
    const files = await fs.readdir(dataPath);
    let currentUserData: UserData | null = null;
    let oldFilePath: string | null = null;

    for (const file of files) {
      if (file.match(/^[a-zA-Z0-9_.-]+-[a-zA-Z0-9_]+\.json$/) && file !== '.settings.json') {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          const parsed = userSchema.safeParse(fileData);
          if (parsed.success && parsed.data.id === userInput.id) {
            currentUserData = parsed.data;
            oldFilePath = path.join(dataPath, file);
            break;
          }
        }
      }
    }

    if (!currentUserData || !oldFilePath) {
      return { message: "User not found for update.", status: "error", errors: { _form: ["User to update not found."] } };
    }

    // Check for username collision if username is being changed
    if (updatesToApply.username && updatesToApply.username !== currentUserData.username) {
      if (updatesToApply.username === process.env.OWNER_USERNAME && currentUserData.id !== 'owner_root') {
        return { message: "Cannot change username to Owner's username.", status: "error", errors: { username: ["This username is reserved."] }};
      }
      const allUsernames = (await loadUsers()).users?.map(u => u.username) || [];
      if (allUsernames.some(uname => uname === updatesToApply.username && uname !== currentUserData!.username)) {
        return { message: "New username already exists.", status: "error", errors: { username: ["New username is already taken."] } };
      }
    }

    const updatedUser: UserData = {
      ...currentUserData,
      ...updatesToApply, // Apply validated changes (username, role, projects, assignedPages, allowedSettingsPages, status)
      updatedAt: now,
    };

    if (newPassword && newPassword.length > 0) { // Only hash and update if a new password was provided and is not empty
      const { hash, salt } = await hashPassword(newPassword);
      updatedUser.hashedPassword = hash;
      updatedUser.salt = salt;
    }

    const newFilePath = getUserFilePath(updatedUser.username, updatedUser.role);

    if (oldFilePath !== newFilePath) {
      try {
        await fs.unlink(oldFilePath);
        if (debugMode) console.log(`[RolesActions - updateUser] Deleted old user file: ${path.basename(oldFilePath)}`);
      } catch (e) {
        // Log error but continue, as saving the new file is more critical
        console.warn(`[RolesActions - updateUser] Could not delete old user file ${path.basename(oldFilePath)}:`, e);
      }
    }

    await saveEncryptedData(path.basename(newFilePath), updatedUser);

    const successMessage = debugMode
        ? `User "${updatedUser.username}" updated successfully in ${path.basename(newFilePath)}.`
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
    return { message: "Owner account cannot be deleted via UI.", status: "error" };
  }

  try {
    const dataPath = getDataPath();
    const files = await fs.readdir(dataPath);
    let userToDelete: UserData | null = null;
    let filePathToDelete: string | null = null;

    for (const file of files) {
       if (file.match(/^[a-zA-Z0-9_.-]+-[a-zA-Z0-9_]+\.json$/) && file !== '.settings.json') {
        const fileData = await loadEncryptedData(file);
        if (fileData) {
          // Directly check the ID from the raw fileData if possible,
          // or parse then check. Parsing is safer to ensure we have the correct UserData structure.
          const potentialUser = fileData as Partial<UserData>; // Cast for ID access
          if (potentialUser.id === userId) {
             const parsed = userSchema.safeParse(fileData); // Validate fully before marking for deletion
             if (parsed.success){
                userToDelete = parsed.data;
                filePathToDelete = path.join(dataPath, file);
                break;
             } else {
                if(debugMode) console.warn(`[RolesActions - deleteUser] Found file for ID ${userId} but it failed schema validation: ${file}`, parsed.error);
             }
          }
        }
      }
    }

    if (!userToDelete || !filePathToDelete) {
      return { message: "User not found for deletion or user data is invalid.", status: "error" };
    }

    // Double-check against .env owner, though 'owner_root' check should suffice
    if (userToDelete.username === process.env.OWNER_USERNAME && userToDelete.role === 'Owner') {
         return { message: "Owner account cannot be deleted.", status: "error" };
    }

    try {
      await fs.unlink(filePathToDelete);
    } catch (e) {
       if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
         // File already gone, which is fine for a delete operation
         if (debugMode) console.warn(`[RolesActions - deleteUser] File not found for user ${userToDelete.username}, assuming already deleted: ${path.basename(filePathToDelete)}`);
       } else {
         throw e; // Re-throw other fs errors
       }
    }

    const successMessage = debugMode
        ? `User "${userToDelete.username}" (file: ${path.basename(filePathToDelete)}) deleted successfully.`
        : `User deleted successfully.`;

    return { message: successMessage, status: "success" };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions - deleteUser] Error deleting user ID ${userId}:`, error);
    return { message: `Error deleting user: ${error.message}`, status: "error" };
  }
}
