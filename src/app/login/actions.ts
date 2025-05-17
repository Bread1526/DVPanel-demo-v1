
"use server";

import { z } from "zod";
import crypto from "crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import type { FileSessionData } from "@/lib/session"; 
import { logEvent } from '@/lib/logger';
import fs from 'fs/promises'; // For file system operations like checking owner file
import path from 'path';
import { getDataPath } from '@/backend/lib/config';

const LoginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
  redirectUrl: z.string().optional(),
  keepLoggedIn: z.boolean().optional().default(false),
});

export interface LoginState {
  message: string;
  status: "idle" | "success" | "error" | "validation_failed";
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | "_form", string[]>>;
}

const initialLoginState: LoginState = { message: "", status: "idle", errors: {} };

// Helper to create/update server-side session file ({username}-{role}-Auth.json)
async function createOrUpdateServerSessionFile(
  userId: string,
  username: string,
  role: string,
  panelSettingsData: any, // PanelSettingsData from settings/actions
  debugMode: boolean
): Promise<string | null> {
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  const sessionToken = crypto.randomBytes(32).toString('hex'); // This is the actual session token
  const now = Date.now();

  const fileSessionData: FileSessionData = {
    userId,
    username,
    role,
    token: sessionToken,
    createdAt: now,
    lastActivity: now,
    sessionInactivityTimeoutMinutes: panelSettingsData?.sessionInactivityTimeout ?? 30,
    disableAutoLogoutOnInactivity: panelSettingsData?.disableAutoLogoutOnInactivity ?? false,
  };

  try {
    await saveEncryptedData(sessionFilename, fileSessionData);
    if (debugMode) {
      console.log(`[LoginAction - createOrUpdateServerSessionFile] Server-side session file ${sessionFilename} created/updated for ${username}. Token: ${sessionToken.substring(0, 6)}...`);
    }
    return sessionToken; 
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[LoginAction - createOrUpdateServerSessionFile] CRITICAL: Failed to save server-side session file ${sessionFilename} for ${username}:`, error);
    logEvent(username, role, 'LOGIN_SERVER_SESSION_SAVE_FAILED', 'ERROR', { error: error.message });
    throw new Error(`Failed to establish server session state for ${username}: ${error.message}`);
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if (debugMode) {
    console.log(`[LoginAction] Attempting login. Owner ENV Username: ${ownerUsernameEnv ? ownerUsernameEnv : 'Not Set'}. Owner ENV Password: ${ownerPasswordEnv ? 'Set (exists)' : 'Not Set'}`);
    // Log FormData entries
    const formDataEntries: Record<string, string | File | null> = {};
    for (const [key, value] of formData.entries()) {
        formDataEntries[key] = value instanceof File ? `File: ${value.name}` : value;
    }
    console.log("[LoginAction] FormData entries:", formDataEntries);
  }
  
  const rawFormData = {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectUrl: String(formData.get("redirectUrl") ?? "/"),
    keepLoggedIn: formData.get("keepLoggedIn") === "on",
  };

  if (debugMode) {
    console.log("[LoginAction] Raw form data extracted for Zod:", {username: rawFormData.username, passwordExists: !!rawFormData.password, redirectUrl: rawFormData.redirectUrl, keepLoggedIn: rawFormData.keepLoggedIn});
  }
  
  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    if (debugMode) {
      console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
    }
    logEvent(rawFormData.username || 'UnknownUser', 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    
    // Construct a more generic message if field errors are present, to guide user to field-specific messages
    const message = (flatErrors.fieldErrors.username || flatErrors.fieldErrors.password) 
                    ? "Please check the form for errors." 
                    : "Validation failed.";

    return {
      message: message,
      status: "validation_failed",
      errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
    };
  }

  const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;
  let loginUsernameForLog = username; // For logging, in case authentication modifies it

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);
    let authenticatedUser: UserData | null = null;
    let authenticatedRole: SessionData['role'] | null = null;
    let authenticatedUserId: string | null = null;

    // 1. Try .env owner login first
    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (debugMode) console.log(`[LoginAction] Comparing with ENV Owner: ${username} vs ${ownerUsernameEnv}`);
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) {
          console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}. Ensuring owner file exists.`);
        }
        const ownerFileData = await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
        // ensureOwnerFileExists now returns UserData or throws error.
        authenticatedUserId = ownerFileData.id; 
        authenticatedUser = ownerFileData;
        authenticatedRole = 'Owner';
        loginUsernameForLog = ownerFileData.username; // Update for logging
        if (debugMode) console.log(`[LoginAction] Owner file ensured. User ID: ${authenticatedUserId}, Role: ${authenticatedRole}`);
      } else if (debugMode && username === ownerUsernameEnv) {
        if (debugMode) console.log("[LoginAction] Owner username matched, but password did not.");
      }
    } else if (debugMode) {
        console.log("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD not set in .env.local. Skipping .env owner check.");
    }

    // 2. If not authenticated as owner, try regular user login from files
    if (!authenticatedUser) {
      if (debugMode) console.log("[LoginAction] Did not authenticate as ENV owner. Attempting login for regular user:", username);
      
      const usersResult = await loadUsers(); // This loads all users from individual files
      if (usersResult.status !== 'success' || !usersResult.users) {
        logEvent(username, 'Unknown', 'LOGIN_USER_LOAD_FAILED', 'ERROR', { error: usersResult.error });
        return { message: usersResult.error || "System error: Could not load user data.", status: "error", errors: { _form: [usersResult.error || "System error: Could not load user data."] } };
      }
      
      const userFromFile = usersResult.users.find(u => u.username === username);

      if (!userFromFile) {
        logEvent(username, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      if (userFromFile.status === 'Inactive') {
        logEvent(username, userFromFile.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
      }

      const isPasswordValid = await verifyPassword(password, userFromFile.hashedPassword, userFromFile.salt);
      if (!isPasswordValid) {
        logEvent(username, userFromFile.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUserId = userFromFile.id;
      authenticatedUser = userFromFile;
      authenticatedRole = userFromFile.role;
      loginUsernameForLog = userFromFile.username; // Update for logging
    }

    // 3. If authentication successful
    if (authenticatedUserId && authenticatedUser && authenticatedRole) {
      if (debugMode) console.log(`[LoginAction] Authentication successful for ${authenticatedUser.username}. Role: ${authenticatedRole}. UserID: ${authenticatedUserId}. Proceeding to session setup.`);

      // This creates/updates {username}-{role}-Auth.json with a token, timestamps, and inactivity settings
      await createOrUpdateServerSessionFile(
        authenticatedUserId,
        authenticatedUser.username,
        authenticatedRole,
        panelGlobalSettingsResult.data, // Pass global settings for defaults
        debugMode
      );
      
      // Set up iron-session cookie
      session.isLoggedIn = true;
      session.userId = authenticatedUserId;
      session.username = authenticatedUser.username;
      session.role = authenticatedRole;
      session.lastActivity = Date.now();
      
      session.sessionInactivityTimeoutMinutes = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

      if (debugMode) console.log("[LoginAction] Iron-session data prepared:", { isLoggedIn: session.isLoggedIn, userId: session.userId, username: session.username, role: session.role, lastActivity: session.lastActivity });

      const cookieOptions = keepLoggedIn ? { maxAge: 60 * 60 * 24 * 30 } : {}; // 30 days or session (default)
      await session.save(cookieOptions);

      logEvent(authenticatedUser.username, authenticatedRole, 'LOGIN_SUCCESS', 'INFO');
      if (debugMode) {
        console.log(`[LoginAction] User ${authenticatedUser.username} login successful. Iron-session cookie set.`);
      }
      
      redirect(redirectUrl || '/'); 
      // This return is for type consistency, redirect will prevent it from being sent.
      // But in case of testing or if redirect doesn't fire, it's here.
      // return { message: "Login successful! Redirecting...", status: "success" }; 
    } else {
      logEvent(username, 'Unknown', 'LOGIN_FAILED_INVALID_CREDENTIALS', 'WARN');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (e: any) { // Catch any error from the try block
    const error = e instanceof Error ? e : new Error(String(e));
    console.error("[LoginAction] UNEXPECTED LOGIN ERROR:", error.message, error.stack);
    if(debugMode) console.error("[LoginAction] Full error object caught:", e);

    logEvent(loginUsernameForLog, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: error.message, stack: error.stack });
    
    let clientErrorMessage = "An unexpected server error occurred during login.";
    if (debugMode && error.message) {
        clientErrorMessage = `Login failed: ${error.message}`;
    } else if (!debugMode && error.message && error.message.startsWith("Failed to establish server session state")) {
        // Don't expose internal "Failed to establish..." to non-debug users
        clientErrorMessage = "An unexpected server error occurred. Please try again.";
    }

    return { 
      message: clientErrorMessage, // Use the refined message
      status: "error", 
      errors: { _form: [clientErrorMessage] } 
    };
  }
}

    