
"use server";

import { z } from "zod";
import crypto from "crypto";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword, hashPassword, type UserData } from '@/app/(app)/roles/actions'; 
import { getDataPath } from "@/backend/lib/config";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import fs from 'fs';
import path from 'path';
import { type PanelSettingsData, loadPanelSettings } from '@/app/(app)/settings/actions';

const LoginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
  redirectUrl: z.string().optional(),
});

export interface LoginState {
  message: string;
  status: "idle" | "success" | "error";
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | "_form", string[]>>;
}


async function getPanelSettingsForDebug(): Promise<PanelSettingsData | undefined> {
    try {
        const settingsResult = await loadPanelSettings();
        return settingsResult.data;
    } catch {
        return undefined;
    }
}

async function ensureOwnerFileOnLogin(ownerUsernameEnv: string, ownerPasswordEnv: string) {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ownerFilename = `${safeOwnerUsername}-Owner.json`;
  const dataPath = getDataPath();
  const ownerFilePath = path.join(dataPath, ownerFilename);

  if (debugMode) {
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Starting for owner: ${ownerUsernameEnv}`);
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Sanitized Owner Filename: ${ownerFilename}`);
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Full Owner File Path: ${ownerFilePath}`);
  }
  
  try {
    const { hash, salt } = await hashPassword(ownerPasswordEnv);
    if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Password hashed for owner.`);
    
    const now = new Date().toISOString();
    let createdAt = now;
    let existingData = null;

    try {
      existingData = await loadEncryptedData(ownerFilename);
      if (debugMode && existingData) console.log(`[LoginAction - ensureOwnerFileOnLogin] Existing data found for ${ownerFilename}.`);
      if (debugMode && !existingData) console.log(`[LoginAction - ensureOwnerFileOnLogin] No existing data found for ${ownerFilename}. Will create anew.`);
    } catch (loadErr) {
      if (debugMode) console.warn(`[LoginAction - ensureOwnerFileOnLogin] Error loading existing owner file ${ownerFilename}, will create anew:`, loadErr instanceof Error ? loadErr.message : String(loadErr));
    }

    if (existingData && typeof (existingData as UserData).createdAt === 'string') {
      createdAt = (existingData as UserData).createdAt;
      if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Preserving createdAt: ${createdAt} from existing file.`);
    } else {
      if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] No existing valid createdAt found for ${ownerFilename} or file doesn't exist. Using current time.`);
    }

    const ownerUserData: UserData = {
      id: 'owner_root', 
      username: ownerUsernameEnv, 
      hashedPassword: hash,
      salt: salt,
      role: 'Owner',
      projects: [], 
      assignedPages: [], 
      allowedSettingsPages: [], 
      lastLogin: now, 
      status: "Active",
      createdAt: createdAt,
      updatedAt: now,
    };
    
    if (debugMode) {
      const dataToLog = {...ownerUserData, hashedPassword: '[REDACTED]', salt: '[REDACTED]'};
      console.log(`[LoginAction - ensureOwnerFileOnLogin] Owner user data prepared for saving:`, JSON.stringify(dataToLog));
      console.log(`[LoginAction - ensureOwnerFileOnLogin] Calling saveEncryptedData for ${ownerFilename}. Data sample:`, JSON.stringify(dataToLog).substring(0, 100) + '...');
    }
    
    await saveEncryptedData(ownerFilename, ownerUserData);
    if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Successfully called saveEncryptedData for ${ownerFilename}.`);
    
    if (fs.existsSync(ownerFilePath)) {
        if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] VERIFIED: Owner file ${path.basename(ownerFilePath)} exists at ${ownerFilePath} after save.`);
    } else {
        if (debugMode) console.error(`[LoginAction - ensureOwnerFileOnLogin] CRITICAL VERIFICATION FAILURE: Owner file ${path.basename(ownerFilePath)} DOES NOT EXIST at ${ownerFilePath} even after saveEncryptedData call. Check storageService or filesystem permissions.`);
    }

  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[LoginAction - ensureOwnerFileOnLogin] CRITICAL: Failed to create/update owner user file:", error.message, error.stack);
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if(debugMode) {
    console.log(`[LoginAction] Attempting login. Debug Mode ON.`);
    console.log(`[LoginAction] OWNER_USERNAME from .env: "${ownerUsernameEnv}"`);
    console.log(`[LoginAction] OWNER_PASSWORD from .env is ${ownerPasswordEnv ? 'SET' : 'NOT SET'}`);
    
    const formEntries: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
      formEntries[key] = value;
    }
    console.log("[LoginAction] FormData entries:", formEntries);
  }
  
  const rawFormData = {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectUrl: String(formData.get("redirectUrl") ?? ""),
  };

  if (debugMode) console.log("[LoginAction] Raw form data extracted for Zod:", rawFormData);

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    const formErrors = validatedFields.error.flatten().formErrors;
    if (debugMode) console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(validatedFields.error.flatten()));
    
    let message = "Please check the form for errors.";
    if (formErrors.length > 0 && !Object.keys(fieldErrors).length) {
      message = formErrors.join(', ');
    }

    return {
      message: message,
      status: "error",
      errors: { ...fieldErrors, _form: formErrors.length > 0 ? formErrors : undefined },
    };
  }

  const { username, password, redirectUrl } = validatedFields.data;

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}. Proceeding to ensure owner file.`);
        await ensureOwnerFileOnLogin(ownerUsernameEnv, ownerPasswordEnv);

        session.user = {
          id: 'owner_root',
          username: ownerUsernameEnv,
          role: 'Owner',
        };
        session.isLoggedIn = true;
        session.lastActivity = Date.now();
        await session.save();
        if (debugMode) console.log("[LoginAction] Owner session saved successfully.");
        
        const destination = redirectUrl || '/';
        if (debugMode) console.log(`[LoginAction] Redirecting owner to: ${destination}`);
        redirect(destination); 
      } else {
        if (debugMode && username === ownerUsernameEnv) console.log("[LoginAction] Owner username matched, but password did not. Proceeding to check user files.");
      }
    } else {
      if (debugMode) console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. The .env owner login path is disabled for direct login, but owner file sync still occurs if owner logs in via other means.");
    }

    if (debugMode) console.log("[LoginAction] Attempting login for regular user:", username);
    const usersResult = await loadUsers();

    if (usersResult.status !== 'success' || !usersResult.users) {
      if (debugMode) console.error("[LoginAction] Error loading user data for regular users:", usersResult.error);
      return { message: usersResult.error || "System error: Could not load user data.", status: "error", errors: { _form: [usersResult.error || "System error: Could not load user data."] } };
    }
    
    const user = usersResult.users.find(u => u.username === username && u.id !== 'owner_root');

    if (!user) {
      if (debugMode) console.log("[LoginAction] Regular user not found or is owner (should have been handled above):", username);
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }
    
    if (user.status === 'Inactive') {
        if (debugMode) console.log(`[LoginAction] User ${username} is inactive.`);
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive. Please contact an administrator."] } };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      if (debugMode) console.log("[LoginAction] Invalid password for regular user:", username);
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

    if (debugMode) console.log(`[LoginAction] Regular user login successful for: ${username}`);
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    session.isLoggedIn = true;
    session.lastActivity = Date.now();
    await session.save();
    if (debugMode) console.log("[LoginAction] Regular user session saved successfully.");
    
    const destination = redirectUrl || '/';
    if (debugMode) console.log(`[LoginAction] Redirecting regular user to: ${destination}`);
    redirect(destination);

  } catch (error: any) {
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; 
    }
    console.error("[LoginAction] Unexpected login error:", error.message, error.stack);
    return { 
      message: `An unexpected error occurred during login. ${debugMode ? error.message : 'Please try again.'}`, 
      status: "error", 
      errors: { _form: [`An unexpected error occurred. ${debugMode ? error.message : ''}`] } 
    };
  }
}
