
"use server";

import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { type PanelSettingsData, loadPanelSettings as loadGeneralPanelSettings } from "@/app/settings/actions";

const USERS_FILENAME = "users.json";

// Schemas
const userPermissionsSchema = z.object({
  projectIds: z.array(z.string()).optional().default([]),
  // Add other granular permissions here later if needed for "Custom" role
  // e.g., canViewLogs: z.boolean().optional(), canManageFiles: z.boolean().optional()
});

export type UserPermissions = z.infer<typeof userPermissionsSchema>;

const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3, "Username must be at least 3 characters long."),
  // email: z.string().email("Invalid email address."), // Email removed
  hashedPassword: z.string(),
  salt: z.string(),
  role: z.enum(["Administrator", "Admin", "Custom"]), // "Owner" is not managed here
  projects: z.array(z.string()).optional().default([]), // For Admin/Custom roles
  assignedPages: z.array(z.string()).optional().default([]), // For Custom role page/module access
  allowedSettingsPages: z.array(z.string()).optional().default([]), // For settings page access
  lastLogin: z.string().optional(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserData = z.infer<typeof userSchema>;
export type UserInput = Omit<UserData, "id" | "hashedPassword" | "salt" | "createdAt" | "updatedAt" | "lastLogin" | "status"> & {
  password?: string; // Optional for updates
  id?: string; // Optional for updates
  status?: "Active" | "Inactive";
};


// Password Hashing Utilities
async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      resolve({ hash: derivedKey.toString("hex"), salt });
    });
  });
}

// Not used in this step, but essential for login later
// async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
//   return new Promise((resolve, reject) => {
//     crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
//       if (err) reject(err);
//       resolve(derivedKey.toString("hex") === storedHash);
//     });
//   });
// }

// --- State types for server actions ---
export interface LoadUsersState {
  users?: UserData[];
  error?: string;
  status: "success" | "error" | "pending";
}
export interface UserActionState {
  message: string;
  status: "idle" | "success" | "error" | "validating";
  errors?: Partial<Record<keyof UserInput | "_form", string[]>>;
  user?: UserData;
}

const initialUserActionState: UserActionState = { message: "", status: "idle" };


// --- Server Actions ---

export async function loadUsers(): Promise<LoadUsersState> {
  console.log("[RolesActions] Attempting to load users...");
  try {
    const data = await loadEncryptedData(USERS_FILENAME);
    if (data === null) {
      console.log("[RolesActions] No users.json file found or it's empty. Returning empty list.");
      return { users: [], status: "success" };
    }
    const usersArraySchema = z.array(userSchema);
    const parsedData = usersArraySchema.safeParse(data);

    if (!parsedData.success) {
      console.error("[RolesActions] Failed to parse users.json:", parsedData.error.flatten().fieldErrors);
      return { users: [], status: "success", error: "User data file is corrupt or in an old format. Displaying no users." };
    }
    console.log(`[RolesActions] Successfully loaded ${parsedData.data.length} users.`);
    return { users: parsedData.data, status: "success" };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[RolesActions] Error loading users:", error);
    return { error: `Failed to load users: ${error.message}`, status: "error" };
  }
}

export async function addUser(prevState: UserActionState, formData: UserInput): Promise<UserActionState> {
  console.log("[RolesActions] Attempting to add user:", formData.username);
  const now = new Date().toISOString();

  const rawData = {
    username: formData.username,
    password: formData.password,
    role: formData.role,
    projects: formData.projects || [],
    assignedPages: formData.assignedPages || [],
    allowedSettingsPages: formData.allowedSettingsPages || [],
  };

  const validationSchema = userSchema.pick({ username: true, role: true, projects: true, assignedPages: true, allowedSettingsPages: true })
    .extend({ password: z.string().min(8, "Password must be at least 8 characters long.") });

  const validatedFields = validationSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error("[RolesActions] Add user validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { password, ...userData } = validatedFields.data;

  try {
    const { users, error: loadError } = await loadUsers();
    if (loadError || !users) {
      return { message: `Failed to load existing users: ${loadError || 'Unknown error'}`, status: "error" };
    }

    if (users.some(u => u.username === userData.username)) {
      return { message: "Username already exists.", status: "error", errors: { username: ["Username already taken"] } };
    }
    
    const { hash, salt } = await hashPassword(password);
    const newUser: UserData = {
      id: uuidv4(),
      ...userData,
      hashedPassword: hash,
      salt: salt,
      status: "Active",
      createdAt: now,
      updatedAt: now,
    };

    const updatedUsers = [...users, newUser];
    await saveEncryptedData(USERS_FILENAME, updatedUsers);
    
    const panelSettings = await getPanelSettingsForDebug();
    const successMessage = panelSettings?.debugMode 
        ? `User "${newUser.username}" added successfully to ${USERS_FILENAME}.`
        : `User "${newUser.username}" added successfully.`;

    return { message: successMessage, status: "success", user: newUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[RolesActions] Error adding user:", error);
    return { message: `Error adding user: ${error.message}`, status: "error" };
  }
}


export async function updateUser(prevState: UserActionState, formData: UserInput): Promise<UserActionState> {
  const userId = formData.id;
  if (!userId) {
    return { message: "User ID is missing.", status: "error", errors: { _form: ["User ID is required for update."] } };
  }
  console.log(`[RolesActions] Attempting to update user ID: ${userId}`);
  const now = new Date().toISOString();

  const rawData = {
    id: formData.id,
    username: formData.username,
    password: formData.password, // Optional
    role: formData.role,
    projects: formData.projects || [],
    assignedPages: formData.assignedPages || [],
    allowedSettingsPages: formData.allowedSettingsPages || [],
    status: formData.status || "Active",
  };

  const updateValidationSchema = userSchema.pick({ id:true, username: true, role: true, projects: true, status:true, assignedPages: true, allowedSettingsPages: true })
    .extend({ password: z.string().min(8, "Password must be at least 8 characters long.").optional().or(z.literal('')) });

  const validatedFields = updateValidationSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error("[RolesActions] Update user validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }
  
  const { password, ...userDataToUpdate } = validatedFields.data;

  try {
    const { users, error: loadError } = await loadUsers();
    if (loadError || !users) {
      return { message: `Failed to load existing users: ${loadError || 'Unknown error'}`, status: "error" };
    }

    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return { message: "User not found.", status: "error", errors: { _form: ["User to update not found."] } };
    }

    const existingUser = users[userIndex];
    
    if (userDataToUpdate.username !== existingUser.username && users.some(u => u.id !== userId && u.username === userDataToUpdate.username)) {
      return { message: "Username already exists.", status: "error", errors: { username: ["Username already taken by another user"] } };
    }

    let newHashedPassword = existingUser.hashedPassword;
    let newSalt = existingUser.salt;

    if (password) { 
      const { hash, salt } = await hashPassword(password);
      newHashedPassword = hash;
      newSalt = salt;
    }

    const updatedUser: UserData = {
      ...existingUser,
      ...userDataToUpdate,
      hashedPassword: newHashedPassword,
      salt: newSalt,
      updatedAt: now,
    };

    const updatedUsersList = [...users];
    updatedUsersList[userIndex] = updatedUser;
    await saveEncryptedData(USERS_FILENAME, updatedUsersList);

    const panelSettings = await getPanelSettingsForDebug();
    const successMessage = panelSettings?.debugMode 
        ? `User "${updatedUser.username}" updated successfully in ${USERS_FILENAME}.`
        : `User "${updatedUser.username}" updated successfully.`;

    return { message: successMessage, status: "success", user: updatedUser };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions] Error updating user ID ${userId}:`, error);
    return { message: `Error updating user: ${error.message}`, status: "error" };
  }
}


export async function deleteUser(userId: string): Promise<UserActionState> {
  console.log(`[RolesActions] Attempting to delete user ID: ${userId}`);
  if (!userId) {
    return { message: "User ID is required for deletion.", status: "error" };
  }

  try {
    const { users, error: loadError } = await loadUsers();
    if (loadError || !users) {
      return { message: `Failed to load existing users: ${loadError || 'Unknown error'}`, status: "error" };
    }

    const initialLength = users.length;
    const updatedUsers = users.filter(u => u.id !== userId);

    if (updatedUsers.length === initialLength) {
      return { message: "User not found for deletion.", status: "error" };
    }

    await saveEncryptedData(USERS_FILENAME, updatedUsers);
    
    const panelSettings = await getPanelSettingsForDebug();
    const successMessage = panelSettings?.debugMode
        ? `User ID "${userId}" deleted successfully from ${USERS_FILENAME}.`
        : `User deleted successfully.`;
        
    return { message: successMessage, status: "success" };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[RolesActions] Error deleting user ID ${userId}:`, error);
    return { message: `Error deleting user: ${error.message}`, status: "error" };
  }
}

async function getPanelSettingsForDebug(): Promise<PanelSettingsData | undefined> {
    try {
        const settings = await loadGeneralPanelSettings();
        return settings.data;
    } catch {
        return undefined;
    }
}
