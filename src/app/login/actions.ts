
"use server";

import { z } from "zod";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword, hashPassword, type UserData } from '@/app/(app)/roles/actions';
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

async function ensureOwnerFileOnLogin(ownerUsername: string, ownerPasswordEnv: string) {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Starting for owner: ${ownerUsername}`);
  try {
    const dataPath = getDataPath();
    const ownerFilename = `${ownerUsername}-Owner.json`;
    const ownerFilePath = path.join(dataPath, ownerFilename);
    if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Target owner file path: ${ownerFilePath}`);

    const { hash, salt } = await hashPassword(ownerPasswordEnv);
    if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Password hashed for owner.`);
    const now = new Date().toISOString();

    let createdAt = now;
    if (fs.existsSync(ownerFilePath)) {
      if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Owner file ${ownerFilename} exists. Attempting to load to preserve createdAt.`);
      try {
        const existingOwnerData = await loadEncryptedData(ownerFilename);
        if (existingOwnerData && typeof (existingOwnerData as UserData).createdAt === 'string') {
          createdAt = (existingOwnerData as UserData).createdAt;
          if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Preserving createdAt: ${createdAt}`);
        } else {
          console.warn(`[LoginAction - ensureOwnerFileOnLogin] Could not find valid createdAt in existing owner file or file empty/corrupt.`);
        }
      } catch (loadErr) {
        console.warn(`[LoginAction - ensureOwnerFileOnLogin] Error loading existing owner file ${ownerFilename} to preserve createdAt:`, loadErr);
      }
    } else {
      if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Owner file ${ownerFilename} does not exist. Will create new.`);
    }

    const ownerUserData: UserData = {
      id: 'owner_root',
      username: ownerUsername,
      hashedPassword: hash,
      salt: salt,
      role: 'Owner',
      projects: [], // Owners have implicit access to all
      assignedPages: [], // Owners have implicit access to all
      allowedSettingsPages: [], // Owners have implicit access to all
      lastLogin: now,
      status: "Active",
      createdAt: createdAt,
      updatedAt: now,
    };
    
    if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Owner user data prepared:`, { username: ownerUserData.username, role: ownerUserData.role, id: ownerUserData.id });
    await saveEncryptedData(ownerFilename, ownerUserData);
    if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] Successfully called saveEncryptedData for ${ownerFilename}.`);
    
    // Verify file existence immediately after save attempt
    if (fs.existsSync(ownerFilePath)) {
        if (debugMode) console.log(`[LoginAction - ensureOwnerFileOnLogin] VERIFIED: Owner file ${ownerFilename} exists at ${ownerFilePath} after save.`);
    } else {
        console.error(`[LoginAction - ensureOwnerFileOnLogin] CRITICAL VERIFICATION FAILURE: Owner file ${ownerFilename} DOES NOT EXIST at ${ownerFilePath} even after saveEncryptedData call. Check storageService or permissions.`);
    }

  } catch (e) {
    console.error("[LoginAction - ensureOwnerFileOnLogin] CRITICAL: Failed to create/update owner user file:", e);
    throw e; // Propagate error to be caught by the main login try-catch
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelSettings = await getPanelSettingsForDebug();
  const debugMode = panelSettings?.debugMode ?? false;

  const rawFormData = {
    username: formData.get("username") as string,
    password: formData.get("password") as string,
    redirectUrl: formData.get("redirectUrl") as string | undefined,
  };
  if (debugMode) console.log("[LoginAction] Received form data:", rawFormData);

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    console.error("[LoginAction] Validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { username, password, redirectUrl } = validatedFields.data;

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) console.log("[LoginAction] Owner .env credentials match for:", ownerUsernameEnv);
        
        try {
          await ensureOwnerFileOnLogin(ownerUsernameEnv, ownerPasswordEnv);
          if (debugMode) console.log("[LoginAction] Owner file ensured/updated successfully by ensureOwnerFileOnLogin.");
        } catch (ownerFileError) {
            console.error("[LoginAction] Error during owner file creation/update, but proceeding with owner login as .env credentials matched:", ownerFileError);
        }

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
      }
    } else {
      console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. The .env owner login path is disabled if no owner file exists yet.");
    }

    if (debugMode) console.log("[LoginAction] Attempting login for regular user:", username);
    const usersResult = await loadUsers();

    if (usersResult.status !== 'success' || !usersResult.users) {
      console.error("[LoginAction] Error loading user data for regular users:", usersResult.error);
      return { message: "System error: Could not load user data. Please try again later or contact support.", status: "error" };
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
    console.error("[LoginAction] Unexpected login error:", error);
    return { message: `An unexpected error occurred during login: ${error.message || 'Unknown error'}. Please try again.`, status: "error" };
  }
}
