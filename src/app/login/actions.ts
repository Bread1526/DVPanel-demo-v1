
"use server";

import { z } from "zod";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword, hashPassword, type UserData } from '@/app/(app)/roles/actions'; // Adjusted path
import { getDataPath } from "@/backend/lib/config";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import fs from 'fs';
import path from 'path';
import { type PanelSettingsData, loadPanelSettings as loadGeneralPanelSettings } from '@/app/(app)/settings/actions';

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
        const settingsResult = await loadGeneralPanelSettings();
        return settingsResult.data;
    } catch {
        return undefined;
    }
}

async function ensureOwnerFileOnLogin(ownerUsernameEnv: string, ownerPasswordEnv: string) {
  console.log(`[LoginAction - ensureOwnerFileOnLogin] ENTERED for owner: ${ownerUsernameEnv}`);
  try {
    const dataPath = getDataPath();
    // Sanitize ownerUsernameEnv for filename
    const safeOwnerUsername = ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ownerFilename = `${safeOwnerUsername}-Owner.json`;
    const ownerFilePath = path.join(dataPath, ownerFilename);
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Target owner file path: ${ownerFilePath}`);

    const { hash, salt } = await hashPassword(ownerPasswordEnv);
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Password hashed for owner.`);
    const now = new Date().toISOString();

    let createdAt = now;
    let existingData = null;
    try {
        existingData = await loadEncryptedData(ownerFilename);
    } catch (loadErr) {
        console.warn(`[LoginAction - ensureOwnerFileOnLogin] Error loading existing owner file ${ownerFilename}, will create anew:`, loadErr instanceof Error ? loadErr.message : String(loadErr));
    }

    if (existingData && typeof (existingData as UserData).createdAt === 'string') {
      createdAt = (existingData as UserData).createdAt;
      console.log(`[LoginAction - ensureOwnerFileOnLogin] Preserving createdAt: ${createdAt} from existing file.`);
    } else {
      console.log(`[LoginAction - ensureOwnerFileOnLogin] No existing valid createdAt found for ${ownerFilename}. Using current time.`);
    }

    const ownerUserData: UserData = {
      id: 'owner_root',
      username: ownerUsernameEnv, // Store the original, unsanitized username in the data
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
    
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Owner user data prepared:`, { username: ownerUserData.username, role: ownerUserData.role, id: ownerUserData.id });
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Calling saveEncryptedData for ${ownerFilename} with data:`, JSON.stringify(ownerUserData).substring(0, 200) + "...");
    
    await saveEncryptedData(ownerFilename, ownerUserData); // Uses sanitized filename
    console.log(`[LoginAction - ensureOwnerFileOnLogin] Successfully returned from saveEncryptedData for ${ownerFilename}.`);
    
    if (fs.existsSync(ownerFilePath)) {
        console.log(`[LoginAction - ensureOwnerFileOnLogin] VERIFIED: Owner file ${path.basename(ownerFilePath)} exists at ${ownerFilePath} after save.`);
    } else {
        console.error(`[LoginAction - ensureOwnerFileOnLogin] CRITICAL VERIFICATION FAILURE: Owner file ${path.basename(ownerFilePath)} DOES NOT EXIST at ${ownerFilePath} even after saveEncryptedData call. Check storageService or filesystem permissions.`);
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

  console.log(`[LoginAction] Attempting login. OWNER_USERNAME from .env: "${ownerUsernameEnv}", OWNER_PASSWORD from .env is ${ownerPasswordEnv ? 'SET' : 'NOT SET'}`);

  const rawFormData = {
    username: formData.get("username") as string,
    password: formData.get("password") as string,
    redirectUrl: formData.get("redirectUrl") as string | undefined,
  };
  if (debugMode) console.log("[LoginAction] Received form data:", rawFormData);

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    if (debugMode) console.error("[LoginAction] Validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { username, password, redirectUrl } = validatedFields.data;

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}. Proceeding to ensure owner file.`);
        await ensureOwnerFileOnLogin(ownerUsernameEnv, ownerPasswordEnv);

        session.user = {
          id: 'owner_root',
          username: ownerUsernameEnv,
          role: 'Owner',
        };
        session.isLoggedIn = true;
        await session.save();
        if (debugMode) console.log("[LoginAction] Owner session saved.");
        
        const destination = redirectUrl || '/';
        if (debugMode) console.log(`[LoginAction] Redirecting owner to: ${destination}`);
        redirect(destination); 
      } else {
        if (debugMode && username === ownerUsernameEnv) console.log("[LoginAction] Owner username matched, but password did not.");
      }
    } else {
      if (debugMode) console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. The .env owner login path is disabled if no owner file exists yet.");
    }

    if (debugMode) console.log("[LoginAction] Attempting login for regular user:", username);
    const usersResult = await loadUsers();

    if (usersResult.status !== 'success' || !usersResult.users) {
      if (debugMode) console.error("[LoginAction] Error loading user data for regular users:", usersResult.error);
      return { message: "System error: Could not load user data.", status: "error" };
    }
    
    const user = usersResult.users.find(u => u.username === username && u.id !== 'owner_root');

    if (!user) {
      if (debugMode) console.log("[LoginAction] Regular user not found or is owner (handled above):", username);
      return { message: "Invalid username or password.", status: "error" };
    }
    
    if (user.status === 'Inactive') {
        if (debugMode) console.log(`[LoginAction] User ${username} is inactive.`);
        return { message: "This account is inactive. Please contact an administrator.", status: "error" };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      if (debugMode) console.log("[LoginAction] Invalid password for regular user:", username);
      return { message: "Invalid username or password.", status: "error" };
    }

    if (debugMode) console.log(`[LoginAction] Regular user login successful for: ${username}`);
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();
    if (debugMode) console.log("[LoginAction] Regular user session saved.");
    
    const destination = redirectUrl || '/';
    if (debugMode) console.log(`[LoginAction] Redirecting regular user to: ${destination}`);
    redirect(destination);

  } catch (error: any) {
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; 
    }
    console.error("[LoginAction] Unexpected login error:", error.message, error.stack);
    return { message: `An unexpected error occurred during login: ${error.message || 'Unknown error'}. Please try again.`, status: "error" };
  }
}
    