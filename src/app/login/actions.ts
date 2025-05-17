
'use server';

import { z } from "zod";
import crypto from "crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { 
  loadUsers, 
  verifyPassword, 
  ensureOwnerFileExists, 
  type UserData as FullUserData,
  loadUserById
} from '@/app/(app)/roles/actions'; 
import type { PanelSettingsData } from '@/app/(app)/settings/types';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { saveEncryptedData } from "@/backend/services/storageService";
import { logEvent } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';
import { getDataPath } from '@/backend/lib/config';
import { LoginSchema, type LoginState } from './types';
import type { FileSessionData } from '@/lib/session';

async function createOrUpdateServerSessionFile(
  userId: string,
  username: string,
  role: string,
  panelSettings: PanelSettingsData | null, // Use PanelSettingsData from types
  debugMode: boolean
): Promise<void> {
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  const fileSessionData: FileSessionData = {
    userId,
    username,
    role,
    token: sessionToken,
    createdAt: now,
    lastActivity: now,
    sessionInactivityTimeoutMinutes: panelSettings?.sessionInactivityTimeout ?? 30,
    disableAutoLogoutOnInactivity: panelSettings?.disableAutoLogoutOnInactivity ?? false,
  };

  try {
    if (debugMode) console.log(`[LoginAction - createOrUpdateServerSessionFile] Preparing to save session file: ${sessionFilename} for user ${username}`);
    await saveEncryptedData(sessionFilename, fileSessionData);
    if (debugMode) {
      console.log(`[LoginAction - createOrUpdateServerSessionFile] Server session file ${sessionFilename} created/updated for ${username}.`);
    }
  } catch (e: any) {
    const errorMessage = `Failed to establish server session state for ${username}: ${e.message}`;
    console.error(`[LoginAction - createOrUpdateServerSessionFile] CRITICAL: ${errorMessage}`, e.stack);
    logEvent(username, role, 'LOGIN_SERVER_SESSION_FILE_SAVE_FAILED', 'ERROR', { error: e.message });
    // Re-throw to be caught by the main login action's catch block
    throw new Error(errorMessage);
  }
}

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  let panelGlobalSettingsResult: Awaited<ReturnType<typeof loadPanelSettings>> | null = null;
  let debugMode = false; 
  let loginUsernameForLog = String(formData.get("username") ?? "UnknownUser");


  try {
    panelGlobalSettingsResult = await loadPanelSettings();
    // Ensure debugMode is derived correctly, even if panelGlobalSettingsResult or its data is null/undefined
    debugMode = panelGlobalSettingsResult?.data?.debugMode ?? false;
    if (debugMode) {
        console.log("[LoginAction] Debug mode is ON based on panel settings.");
    } else {
        console.log("[LoginAction] Debug mode is OFF based on panel settings (or settings not loaded).");
    }
    
    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    if (debugMode) {
      console.log(`[LoginAction] OWNER_USERNAME from .env.local: ${ownerUsernameEnv || "Not Set"}`);
      console.log(`[LoginAction] OWNER_PASSWORD from .env.local is set: ${ownerPasswordEnv ? 'Yes' : 'No'}`);
      const formDataEntries = Array.from(formData.entries());
      console.log("[LoginAction] FormData entries:", formDataEntries.map(([k,v]) => [k, k === 'password' ? '******' : v]));
    }
    
    const rawFormData = {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectUrl: String(formData.get("redirectUrl") ?? "/"),
      keepLoggedIn: formData.get("keepLoggedIn") === "on",
    };
  
    if (debugMode) console.log("[LoginAction] Raw form data extracted for Zod:", {username: rawFormData.username, passwordExists: !!rawFormData.password, keepLoggedIn: rawFormData.keepLoggedIn, redirectUrl: rawFormData.redirectUrl});

    const validatedFields = LoginSchema.safeParse(rawFormData);

    if (!validatedFields.success) {
      const flatErrors = validatedFields.error.flatten();
      if (debugMode) console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
      
      loginUsernameForLog = rawFormData.username || 'InvalidUserAttempt';
      logEvent(loginUsernameForLog, 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
      
      const message = (flatErrors.fieldErrors.username || flatErrors.fieldErrors.password) 
                      ? "Please check the form for errors." 
                      : "Validation failed. Please provide all required information.";
      return { status: "validation_failed", message, errors: flatErrors.fieldErrors };
    }

    const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;
    loginUsernameForLog = username; // Update for more accurate logging post-validation
    if (debugMode) console.log(`[LoginAction] Attempting login for user: ${username}, KeepLoggedIn: ${keepLoggedIn}`);
    
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);
    let authenticatedUser: FullUserData | null = null;
    let authenticatedRole: SessionData['role'] | null = null;
    let authenticatedUserId: string | null = null;

    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (debugMode) console.log(`[LoginAction] Comparing with ENV Owner: Input username '${username}' vs ENV '${ownerUsernameEnv}'`);
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}. Ensuring owner file.`);
        
        const ownerDataFromFile = await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult?.data || null);
        authenticatedUserId = ownerDataFromFile.id; 
        authenticatedUser = ownerDataFromFile;
        authenticatedRole = 'Owner';
        loginUsernameForLog = ownerDataFromFile.username; // Ensure log uses actual owner username
        if (debugMode) console.log(`[LoginAction] Owner file ensured/updated. User ID: ${authenticatedUserId}, Role: ${authenticatedRole}`);
      } else if (debugMode && username === ownerUsernameEnv) {
        if (debugMode) console.log("[LoginAction] Owner username matched ENV, but password did not.");
      }
    } else if (debugMode) {
      console.log("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD not set in .env.local. Skipping .env owner check.");
    }

    if (!authenticatedUser) {
      if (debugMode) console.log("[LoginAction] Did not authenticate as ENV owner. Attempting login for regular user:", username);
      const usersListResult = await loadUsers();
      if (usersListResult.status === 'error' || !usersListResult.users) {
        if(debugMode) console.error("[LoginAction] Failed to load user list or no users found:", usersListResult.error);
        logEvent(username, 'Unknown', 'LOGIN_USER_LOAD_FAILED', 'ERROR', { error: usersListResult.error });
        throw new Error(usersListResult.error || "Failed to load user list for authentication.");
      }
      const userFromFile = usersListResult.users.find(u => u.username === username);

      if (!userFromFile) {
        if(debugMode) console.log(`[LoginAction] User ${username} not found in users.json.`);
        logEvent(username, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { status: "error", message: "Invalid username or password.", errors: { _form: ["Invalid username or password."] } };
      }
      if (userFromFile.status === 'Inactive') {
        if(debugMode) console.log(`[LoginAction] User ${username} is inactive.`);
        logEvent(username, userFromFile.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { status: "error", message: "This account is inactive. Please contact an administrator.", errors: { _form: ["This account is inactive."] } };
      }

      const isPasswordValid = await verifyPassword(password, userFromFile.hashedPassword, userFromFile.salt);
      if (!isPasswordValid) {
        if(debugMode) console.log(`[LoginAction] Invalid password for user ${username}.`);
        logEvent(username, userFromFile.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { status: "error", message: "Invalid username or password.", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUserId = userFromFile.id;
      authenticatedUser = userFromFile;
      authenticatedRole = userFromFile.role;
      loginUsernameForLog = userFromFile.username; // Ensure log uses actual username
    }

    if (authenticatedUserId && authenticatedUser && authenticatedRole) {
      if (debugMode) console.log(`[LoginAction] Auth successful for ${authenticatedUser.username}. Role: ${authenticatedRole}. UserID: ${authenticatedUserId}. Creating server session file and iron-session cookie.`);

      await createOrUpdateServerSessionFile(
        authenticatedUserId,
        authenticatedUser.username,
        authenticatedRole,
        panelGlobalSettingsResult?.data || null, // Pass full settings or null
        debugMode
      );
      
      session.isLoggedIn = true;
      session.userId = authenticatedUserId;
      session.username = authenticatedUser.username;
      session.role = authenticatedRole;
      session.lastActivity = Date.now();
      session.sessionInactivityTimeoutMinutes = panelGlobalSettingsResult?.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelGlobalSettingsResult?.data?.disableAutoLogoutOnInactivity ?? false;

      const cookieOptions = keepLoggedIn ? { maxAge: 60 * 60 * 24 * 30 } : {}; 
      if (debugMode) console.log(`[LoginAction] Saving iron-session with options:`, cookieOptions);
      await session.save(cookieOptions);

      logEvent(authenticatedUser.username, authenticatedRole, 'LOGIN_SUCCESS', 'INFO');
      if (debugMode) console.log(`[LoginAction] User ${authenticatedUser.username} login successful. Iron-session cookie set. Redirecting to: ${redirectUrl || '/'}`);
      
      redirect(redirectUrl || '/'); 
      // This return is for type consistency, redirect will prevent it from being sent
      // However, to satisfy TypeScript, we might add a return statement here.
      // But since redirect() throws an error, this line is effectively unreachable.
      // To make linters happy, one might return the state, but it's not strictly necessary for runtime.
      // For now, we will rely on redirect() behavior.

    } else {
      // This case should ideally be caught earlier (e.g. user not found, invalid password)
      if(debugMode) console.log(`[LoginAction] Authentication failed for ${username} - no authenticatedUser object populated.`);
      logEvent(username, 'Unknown', 'LOGIN_FAILED_INVALID_CREDENTIALS', 'WARN');
      return { status: "error", message: "Invalid username or password.", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (e: any) {
    // Always log detailed error to server console
    console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
    console.error("[LoginAction] Full error object caught:", e);
    if (e.message) console.error("[LoginAction] Error Message:", e.message);
    if (e.stack) console.error("[LoginAction] Error Stack:", e.stack);

    let clientErrorMessage = "An unexpected server error occurred during login. Please check server logs for details.";
    
    // Attempt to use debugMode fetched earlier, if available
    const currentDebugMode = panelGlobalSettingsResult?.data?.debugMode ?? false; 

    if (currentDebugMode) {
        if (e.message) {
            clientErrorMessage = `Login Server Error: ${e.message}`;
            if (e.stack) {
                // Keep stack trace relatively short for client display
                clientErrorMessage += ` | Stack: ${String(e.stack).substring(0, 300)}...`; 
            }
        } else if (typeof e === 'string') {
            clientErrorMessage = `Login Server Error: ${e}`;
        } else {
            try {
                clientErrorMessage = `Login Server Error: An unknown error object was caught. Details: ${JSON.stringify(e).substring(0,300)}...`;
            } catch (jsonError) {
                clientErrorMessage = `Login Server Error: An unknown, non-serializable error object was caught.`;
            }
        }
    }

    logEvent(loginUsernameForLog, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message || String(e) });
    return { 
        status: "error", 
        message: "An unexpected server error occurred during login.", // Generic message for toast
        errors: { _form: [clientErrorMessage] } // More detailed message for the Alert on the page
    };
  }
}

    