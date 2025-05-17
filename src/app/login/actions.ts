
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData, type AuthenticatedUser } from '@/lib/session';
import { loadUsers, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import type { FileSessionData } from "@/lib/session"; // For server-side session file
import { logEvent } from '@/lib/logger';

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

// Helper to create/update server-side session file
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
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  const sessionFileData: FileSessionData = {
    userId,
    username,
    role,
    token: sessionToken, // This token is for the file, not directly for the cookie
    createdAt: now,
    lastActivity: now,
    sessionInactivityTimeoutMinutes: panelSettingsData?.sessionInactivityTimeout ?? 30,
    disableAutoLogoutOnInactivity: panelSettingsData?.disableAutoLogoutOnInactivity ?? false,
  };

  try {
    await saveEncryptedData(sessionFilename, sessionFileData);
    if (debugMode) {
      console.log(`[LoginAction] Server-side session file ${sessionFilename} created/updated for ${username}.`);
    }
    return sessionToken; // This token isn't strictly needed by iron-session flow but good for file integrity.
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[LoginAction] CRITICAL: Failed to save server-side session file ${sessionFilename} for ${username}:`, error);
    logEvent(username, role, 'LOGIN_SERVER_SESSION_SAVE_FAILED', 'ERROR', { error: error.message });
    // Propagate error to be caught by the main login try-catch
    throw new Error(`Failed to establish server session state for ${username}.`);
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if (debugMode) {
    console.log(`[LoginAction] Attempting login. Owner ENV Username: ${ownerUsernameEnv ? ownerUsernameEnv : 'Not Set'}. Owner ENV Password: ${ownerPasswordEnv ? 'Set' : 'Not Set'}`);
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
    return {
      message: "Please check the form for errors.",
      status: "validation_failed",
      errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
    };
  }

  const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);
    let authenticatedUser: UserData | AuthenticatedUser | null = null; // Can be from file or owner
    let authenticatedRole: SessionData['role'] | null = null;
    let authenticatedUserId: string | null = null;

    // 1. Try .env owner login first
    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (debugMode) console.log(`[LoginAction] Comparing with ENV Owner: ${username} vs ${ownerUsernameEnv}`);
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) {
          console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}. Ensuring owner file exists.`);
        }
        // This function also hashes the .env password and saves/updates the owner's file
        const ownerFileData = await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
        if (!ownerFileData) {
          throw new Error("Failed to ensure owner file integrity during login.");
        }
        
        authenticatedUserId = ownerFileData.id; // Should be 'owner_root'
        authenticatedUser = ownerFileData; // Use the data from ensureOwnerFileExists
        authenticatedRole = 'Owner';
        if (debugMode) console.log(`[LoginAction] Owner file ensured. User ID: ${authenticatedUserId}, Role: ${authenticatedRole}`);
      } else if (debugMode && username === ownerUsernameEnv) {
        console.log("[LoginAction] Owner username matched, but password did not.");
      }
    } else if (debugMode) {
        console.log("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD not set in .env.local. Skipping .env owner check.");
    }

    // 2. If not authenticated as owner, try regular user login from files
    if (!authenticatedUser) {
      if (debugMode) console.log("[LoginAction] Did not authenticate as ENV owner. Attempting login for regular user:", username);
      
      const usersResult = await loadUsers();
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
    }

    // 3. If authentication successful (either owner or regular user)
    if (authenticatedUserId && authenticatedUser && authenticatedRole) {
      if (debugMode) console.log(`[LoginAction] Authentication successful for ${username}. Role: ${authenticatedRole}. UserID: ${authenticatedUserId}. Proceeding to session setup.`);

      // Create/Update server-side session file for this login session
      await createOrUpdateServerSessionFile(
        authenticatedUserId,
        authenticatedUser.username,
        authenticatedRole,
        panelGlobalSettingsResult.data,
        debugMode
      );
      
      // Set up iron-session cookie
      session.isLoggedIn = true;
      session.userId = authenticatedUserId;
      session.username = authenticatedUser.username;
      session.role = authenticatedRole;
      session.lastActivity = Date.now();
      
      // Store global panel settings for session inactivity into the iron-session
      session.sessionInactivityTimeoutMinutes = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

      if (debugMode) console.log("[LoginAction] Iron-session data prepared:", { isLoggedIn: session.isLoggedIn, userId: session.userId, username: session.username, role: session.role, lastActivity: session.lastActivity });

      const cookieOptions = keepLoggedIn ? { maxAge: 60 * 60 * 24 * 30 } : {}; // 30 days or session (default)
      await session.save(cookieOptions);

      logEvent(authenticatedUser.username, authenticatedRole, 'LOGIN_SUCCESS', 'INFO');
      if (debugMode) {
        console.log(`[LoginAction] User ${authenticatedUser.username} login successful. Iron-session cookie set.`);
      }
      
      // Perform server-side redirect
      if (debugMode) console.log(`[LoginAction] Redirecting to: ${redirectUrl || '/'}`);
      redirect(redirectUrl || '/'); 
      // This return is mostly for type consistency, redirect will prevent it from being sent
      // return { message: "Login successful! Redirecting...", status: "success" };
    } else {
      // This case implies neither owner nor regular user authentication succeeded
      logEvent(username, 'Unknown', 'LOGIN_FAILED_INVALID_CREDENTIALS', 'WARN');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (error: any) {
    console.error("[LoginAction] UNEXPECTED LOGIN ERROR:", error.message, error.stack);
    logEvent(username, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: error.message, stack: error.stack });
    const errorMessage = debugMode ? error.message : "An unexpected server error occurred during login.";
    return { 
      message: `Login failed: ${errorMessage}`, 
      status: "error", 
      errors: { _form: [`An unexpected error occurred. ${errorMessage}`] } 
    };
  }
}

