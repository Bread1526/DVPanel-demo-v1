
"use server";

import { z } from "zod";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword, hashPassword, type UserData } from '@/app/(app)/roles/actions'; // Adjusted path
import { saveEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs'; // For checking owner file existence, can be fs.promises too

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

async function ensureOwnerFile(ownerUsername: string, ownerPasswordEnv: string) {
  try {
    const dataPath = getDataPath();
    const ownerFilename = `${ownerUsername}-Owner.json`;
    const ownerFilePath = path.join(dataPath, ownerFilename);

    const { hash, salt } = await hashPassword(ownerPasswordEnv);
    const now = new Date().toISOString();

    const ownerUserData: UserData = {
      id: 'owner_root',
      username: ownerUsername,
      hashedPassword: hash,
      salt: salt,
      role: 'Owner',
      projects: [], // Owner has implicit full access, this is for schema compliance
      assignedPages: [], // Owner has implicit full access
      allowedSettingsPages: [], // Owner has implicit full access
      lastLogin: now,
      status: "Active",
      createdAt: fs.existsSync(ownerFilePath) ? (await loadUsers({ status: "success", users: [] })).users?.find(u => u.id === 'owner_root')?.createdAt || now : now,
      updatedAt: now,
    };
    await saveEncryptedData(ownerFilename, ownerUserData);
    console.log(`[LoginAction] Ensured/Updated owner file: ${ownerFilename}`);
  } catch (e) {
    console.error("[LoginAction] CRITICAL: Failed to create/update owner user file:", e);
    // Depending on policy, you might want to prevent login or just log this.
    // For now, it will log and continue, relying on .env for auth.
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const rawFormData = {
    username: formData.get("username") as string,
    password: formData.get("password") as string,
    redirectUrl: formData.get("redirectUrl") as string | undefined,
  };

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
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
        console.log("[LoginAction] Owner login successful for:", ownerUsernameEnv);
        
        // Ensure owner file exists and is up-to-date with .env password (hashed)
        await ensureOwnerFile(ownerUsernameEnv, ownerPasswordEnv);

        session.user = {
          id: 'owner_root',
          username: ownerUsernameEnv,
          role: 'Owner',
        };
        session.isLoggedIn = true;
        await session.save();
        
        const destination = redirectUrl || '/';
        redirect(destination);
      }
    } else {
      console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. The .env owner login path is disabled if no owner file exists.");
    }

    // If not .env owner or .env owner login failed, check other users
    console.log("[LoginAction] Attempting login for regular user:", username);
    const usersResult = await loadUsers(); // This now loads from individual files

    if (usersResult.status !== 'success' || !usersResult.users) {
      console.error("[LoginAction] Error loading user data:", usersResult.error);
      return { message: "System error: Could not load user data. Please try again later or contact support.", status: "error" };
    }
    
    const user = usersResult.users.find(u => u.username === username && u.id !== 'owner_root'); // Exclude owner_root if found by file scan

    if (!user) {
      console.log("[LoginAction] User not found or is owner (handled above):", username);
      return { message: "Invalid username or password.", status: "error" };
    }
    
    if (user.status === 'Inactive') {
        console.log(`[LoginAction] User ${username} is inactive.`);
        return { message: "This account is inactive. Please contact an administrator.", status: "error" };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      console.log("[LoginAction] Invalid password for user:", username);
      return { message: "Invalid username or password.", status: "error" };
    }

    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();
    
    const destination = redirectUrl || '/';
    redirect(destination);

  } catch (error: any) {
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error("[LoginAction] Unexpected login error:", error);
    return { message: "An unexpected error occurred during login. Please try again.", status: "error" };
  }
}
