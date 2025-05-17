
"use server";

import { z } from "zod";
import crypto from "crypto";
import { redirect } from 'next/navigation';
import { loadUsers, verifyPassword, hashPassword } from '@/app/(app)/roles/actions'; 
import { type FileSessionData } from '@/lib/session';
import { saveEncryptedData } from "@/backend/services/storageService";
import { loadPanelSettings, type PanelSettingsData } from "@/app/(app)/settings/actions";
import fs from 'fs';
import path from 'path';
import { getDataPath } from "@/backend/lib/config";

const LoginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
  redirectUrl: z.string().optional(),
  keepLoggedIn: z.boolean().optional(), // Not directly used for session file lifetime, but kept for future if needed
});

export interface LoginState {
  message: string;
  status: "idle" | "success" | "error" | "validation_failed";
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | "_form", string[]>>;
  sessionInfo?: { // Info to send back to client to store in localStorage
    token: string;
    userId: string;
    username: string;
    role: string;
  };
}

async function getPanelSettingsForDefaults(): Promise<Partial<PanelSettingsData>> {
    try {
        const settingsResult = await loadPanelSettings();
        if (settingsResult.data) {
            return {
                sessionInactivityTimeout: settingsResult.data.sessionInactivityTimeout,
                disableAutoLogoutOnInactivity: settingsResult.data.disableAutoLogoutOnInactivity,
            };
        }
    } catch (e) {
        console.warn("[LoginAction] Could not load panel settings for session defaults, using hardcoded defaults:", e);
    }
    return {
        sessionInactivityTimeout: 30, // Default 30 minutes
        disableAutoLogoutOnInactivity: false, // Default to auto-logout enabled
    };
}

async function createOrUpdateOwnerSessionFile(ownerUsernameEnv: string, ownerPasswordEnv: string): Promise<FileSessionData | null> {
  const panelSettings = await loadPanelSettings();
  const debugMode = panelSettings.data?.debugMode ?? false;
  const defaultSessionSettings = await getPanelSettingsForDefaults();

  const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ownerSessionFilename = `${safeOwnerUsername}-Owner-Auth.json`;
  const dataPath = getDataPath();
  const ownerSessionFilePath = path.join(dataPath, ownerSessionFilename);

  if (debugMode) {
    console.log(`[LoginAction - createOrUpdateOwnerSessionFile] Starting for owner: ${ownerUsernameEnv}`);
    console.log(`[LoginAction - createOrUpdateOwnerSessionFile] Session Filename: ${ownerSessionFilename}`);
    console.log(`[LoginAction - createOrUpdateOwnerSessionFile] Full Session File Path: ${ownerSessionFilePath}`);
  }
  
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    const ownerSessionData: FileSessionData = {
      userId: 'owner_root', 
      username: ownerUsernameEnv, 
      role: 'Owner',
      token: token,
      createdAt: now,
      lastActivity: now,
      sessionInactivityTimeoutMinutes: defaultSessionSettings.sessionInactivityTimeout ?? 30,
      disableAutoLogoutOnInactivity: defaultSessionSettings.disableAutoLogoutOnInactivity ?? false,
    };
    
    await saveEncryptedData(ownerSessionFilename, ownerSessionData);
    if (debugMode) {
        console.log(`[LoginAction - createOrUpdateOwnerSessionFile] Owner session file ${ownerSessionFilename} saved/updated.`);
        if (fs.existsSync(ownerSessionFilePath)) {
            console.log(`[LoginAction - createOrUpdateOwnerSessionFile] VERIFIED: Owner session file exists at ${ownerSessionFilePath}`);
        } else {
            console.error(`[LoginAction - createOrUpdateOwnerSessionFile] CRITICAL VERIFICATION FAILURE: Owner session file DOES NOT EXIST at ${ownerSessionFilePath} after save.`);
        }
    }
    return ownerSessionData;

  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[LoginAction - createOrUpdateOwnerSessionFile] CRITICAL: Failed to create/update owner session file:", error.message, error.stack);
    return null;
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelSettings = await loadPanelSettings();
  const debugMode = panelSettings.data?.debugMode ?? false;

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if(debugMode) {
    console.log(`[LoginAction] Attempting login. Debug Mode: ${debugMode}.`);
    console.log(`[LoginAction] Env OWNER_USERNAME: "${ownerUsernameEnv}"`);
    console.log(`[LoginAction] Env OWNER_PASSWORD is ${ownerPasswordEnv ? 'SET' : 'NOT SET'}`);
  }
  
  const rawFormData = {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectUrl: String(formData.get("redirectUrl") ?? "/"),
    keepLoggedIn: formData.get("keepLoggedIn") === "on",
  };

  if (debugMode) console.log("[LoginAction] Raw form data for Zod:", rawFormData);

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    if (debugMode) console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors));
    
    let message = "Please correct the highlighted fields.";
    if (flatErrors.formErrors.length > 0 && !Object.keys(flatErrors.fieldErrors).length) {
      message = flatErrors.formErrors.join(', ');
    }
    return {
      message: message,
      status: "validation_failed",
      errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
    };
  }

  const { username, password } = validatedFields.data;
  const defaultSessionSettings = await getPanelSettingsForDefaults();

  try {
    // Try .env owner login first
    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (debugMode) console.log(`[LoginAction] Comparing input "${username}" with ENV_OWNER "${ownerUsernameEnv}"`);
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}.`);
        
        // Create/update owner's main user file (for roles page, etc.)
        // This creates a {username}-{role}.json file for owner, not the -Auth.json file
        const { hash: ownerHash, salt: ownerSalt } = await hashPassword(ownerPasswordEnv);
        const ownerMainUserData = {
            id: 'owner_root', username: ownerUsernameEnv, role: 'Owner', hashedPassword: ownerHash, salt: ownerSalt,
            projects: [], assignedPages: [], allowedSettingsPages: [], status: 'Active',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLogin: new Date().toISOString()
        };
        const ownerMainFilename = `${ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_')}-Owner.json`;
        await saveEncryptedData(ownerMainFilename, ownerMainUserData);
        if (debugMode) console.log(`[LoginAction] Owner main user file ${ownerMainFilename} ensured.`);


        const ownerSession = await createOrUpdateOwnerSessionFile(ownerUsernameEnv, ownerPasswordEnv);
        if (ownerSession) {
          if (debugMode) console.log("[LoginAction] Owner session file created/updated. Returning success to client.");
          return {
            message: "Owner login successful!",
            status: "success",
            sessionInfo: {
              token: ownerSession.token,
              userId: ownerSession.userId,
              username: ownerSession.username,
              role: ownerSession.role,
            }
          };
        } else {
           return { message: "Owner login succeeded but failed to create session file.", status: "error", errors: { _form: ["System error during owner session creation."] } };
        }
      } else {
        if (debugMode && username === ownerUsernameEnv) console.log("[LoginAction] Owner username matched, but password did not.");
      }
    } else {
      if (debugMode) console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local.");
    }

    // Try regular user login from files
    if (debugMode) console.log("[LoginAction] Attempting login for regular user:", username);
    const usersResult = await loadUsers();

    if (usersResult.status !== 'success' || !usersResult.users) {
      if (debugMode) console.error("[LoginAction] Error loading user data for regular users:", usersResult.error);
      return { message: usersResult.error || "System error: Could not load user data.", status: "error", errors: { _form: [usersResult.error || "System error: Could not load user data."] } };
    }
    
    const user = usersResult.users.find(u => u.username === username);

    if (!user) {
      if (debugMode) console.log("[LoginAction] Regular user not found:", username);
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }
    
    if (user.status === 'Inactive') {
        if (debugMode) console.log(`[LoginAction] User ${username} is inactive.`);
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      if (debugMode) console.log("[LoginAction] Invalid password for regular user:", username);
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

    // Create session file for regular user
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const userSessionData: FileSessionData = {
      userId: user.id,
      username: user.username,
      role: user.role,
      token: token,
      createdAt: now,
      lastActivity: now,
      sessionInactivityTimeoutMinutes: defaultSessionSettings.sessionInactivityTimeout ?? 30,
      disableAutoLogoutOnInactivity: defaultSessionSettings.disableAutoLogoutOnInactivity ?? false,
    };
    const sessionFilename = `${user.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${user.role}-Auth.json`;
    await saveEncryptedData(sessionFilename, userSessionData);
    if (debugMode) console.log(`[LoginAction] Session file ${sessionFilename} created for user ${user.username}.`);

    // Update lastLogin for the main user file
    const userToUpdate = {...user, lastLogin: new Date().toISOString()};
    const userMainFilename = `${user.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${user.role}.json`;
    await saveEncryptedData(userMainFilename, userToUpdate);
    if (debugMode) console.log(`[LoginAction] Updated lastLogin for user ${user.username} in file ${userMainFilename}`);


    if (debugMode) console.log(`[LoginAction] Regular user login successful for: ${username}`);
    return {
      message: "Login successful!",
      status: "success",
      sessionInfo: {
        token: token,
        userId: user.id,
        username: user.username,
        role: user.role,
      }
    };

  } catch (error: any) {
    console.error("[LoginAction] Unexpected login error:", error.message, error.stack);
    return { 
      message: `An unexpected error occurred. ${debugMode ? error.message : ''}`, 
      status: "error", 
      errors: { _form: [`An unexpected error occurred. ${debugMode ? error.message : ''}`] } 
    };
  }
}
