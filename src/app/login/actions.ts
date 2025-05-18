
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData, type FileSessionData } from '@/lib/session';
import { loadUserById, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { logEvent } from '@/lib/logger';
import { LoginSchema, type LoginState } from './types';
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from "fs/promises";

// Helper function to create/update the server-side session file
export async function createOrUpdateServerSessionFile(
  username: string,
  role: string,
  userId: string,
  token: string,
  sessionTimeoutMinutes: number,
  disableAutoLogout: boolean,
  debugMode?: boolean
): Promise<void> {
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const sanitizedRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${sanitizedUsername}-${sanitizedRole}-Auth.json`;

  if (debugMode) {
    console.log(`[LoginAction - createOrUpdateServerSessionFile] Called for user: ${username}, role: ${role}. Filename: ${sessionFilename}`);
  }

  const sessionFileData: FileSessionData = {
    userId,
    username,
    role,
    token,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    sessionInactivityTimeoutMinutes: sessionTimeoutMinutes,
    disableAutoLogoutOnInactivity: disableAutoLogout,
  };

  try {
    await saveEncryptedData(sessionFilename, sessionFileData);
    if (debugMode) {
      console.log(`[LoginAction - createOrUpdateServerSessionFile] Server session file ${sessionFilename} created/updated successfully for ${username}.`);
    }
  } catch (error: any) {
    console.error(`[LoginAction - createOrUpdateServerSessionFile] CRITICAL: Failed to save server session file ${sessionFilename} for ${username}:`, error);
    throw new Error(`Failed to establish session on server (file save error for ${sessionFilename}): ${error.message}`);
  }
}

export async function deleteServerSessionFile(username: string, role: string, debugMode?: boolean): Promise<void> {
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  const dataPath = getDataPath();
  const sessionFilePath = path.join(dataPath, sessionFilename);

  try {
    await fs.unlink(sessionFilePath);
    if (debugMode) console.log(`[DeleteServerSessionFile] Server-side session file ${sessionFilename} deleted for ${username}.`);
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      if (debugMode) console.warn(`[DeleteServerSessionFile] Server-side session file ${sessionFilename} not found for ${username}, presumed already deleted.`);
    } else {
      console.error(`[DeleteServerSessionFile] Error deleting server-side session file ${sessionFilename} for ${username}:`, e);
      // Optionally re-throw or handle as critical if deletion must succeed
    }
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  let username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectUrl = String(formData.get("redirectUrl") ?? "/");

  // Unconditional server-side logging for the start of the login attempt
  console.log(`[LoginAction] Attempting login for user: ${username || "'' (empty username)"}`);

  // Load global panel settings to determine debug mode and default session settings
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;
  const defaultSessionTimeoutMins = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
  const defaultDisableAutoLogout = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

  if (debugMode) {
    console.log("[LoginAction] OWNER_USERNAME from .env.local:", process.env.OWNER_USERNAME ? `Set (val: ${process.env.OWNER_USERNAME})` : "Not Set");
    console.log("[LoginAction] OWNER_PASSWORD from .env.local is set:", process.env.OWNER_PASSWORD ? "Yes" : "No");
    console.log("[LoginAction] Default session timeout from global settings:", defaultSessionTimeoutMins, "Disable auto logout:", defaultDisableAutoLogout);
  }

  let operationSuccessful = false;
  let redirectPath: string | null = null;

  try {
    const rawFormData = {
      username: username,
      password: password,
      redirectUrl: redirectUrl,
      // keepLoggedIn is not used with iron-session in this direct way for maxAge here.
      // iron-session's cookie maxAge is global or session-long by default.
    };

    if (debugMode) {
      const formDataEntries: any = {};
      formData.forEach((value, key) => { formDataEntries[key] = value; });
      console.log("[LoginAction] FormData entries:", formDataEntries);
      console.log("[LoginAction] Raw form data extracted for Zod:", rawFormData);
    }

    const validatedFields = LoginSchema.safeParse(rawFormData);

    if (!validatedFields.success) {
      const flatErrors = validatedFields.error.flatten();
      if (debugMode) {
        console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
      }
      logEvent(username, 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
      return {
        message: "Please check the form for errors.", // Generic message, specific errors shown under fields
        status: "validation_failed",
        errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
      };
    }

    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    let authenticatedUser: Pick<UserData, 'id' | 'username' | 'role' | 'status'> | null = null;

    if (ownerUsernameEnv && username === ownerUsernameEnv) {
      if (debugMode) console.log("[LoginAction] Attempting login as .env.local Owner:", ownerUsernameEnv);
      if (password === ownerPasswordEnv) {
        if (debugMode) console.log("[LoginAction] .env.local Owner credentials MATCHED.");
        // Ensure the owner's file exists and is up-to-date
        await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
        authenticatedUser = {
            id: 'owner_root',
            username: ownerUsernameEnv,
            role: 'Owner',
            status: 'Active',
        };
        if (debugMode) console.log("[LoginAction] Owner login successful. User data for session:", authenticatedUser);
      } else {
        if (debugMode) console.warn("[LoginAction] .env.local Owner username matched, but password DID NOT MATCH.");
        logEvent(username, 'OwnerAttempt', 'LOGIN_OWNER_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
    } else {
      if (debugMode) console.log(`[LoginAction] Attempting login for regular user: ${username}`);
      const users = await loadUsers(); // This now loads from individual files
      const userToAuth = users.users?.find(u => u.username === username);

      if (!userToAuth) {
        if (debugMode) console.warn(`[LoginAction] Regular user "${username}" not found in any user file.`);
        logEvent(username, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }

      if (userToAuth.status === 'Inactive') {
        if (debugMode) console.warn(`[LoginAction] User "${username}" account is inactive.`);
        logEvent(username, userToAuth.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
      }

      const isPasswordValid = await verifyPassword(password, userToAuth.hashedPassword, userToAuth.salt);
      if (!isPasswordValid) {
        if (debugMode) console.warn(`[LoginAction] Invalid password for user "${username}".`);
        logEvent(username, userToAuth.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUser = userToAuth;
      if (debugMode) console.log(`[LoginAction] Regular user "${username}" login successful. User data for session:`, authenticatedUser);
    }

    if (authenticatedUser) {
      // Create/Update the server-side session file with a token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await createOrUpdateServerSessionFile(
        authenticatedUser.username,
        authenticatedUser.role,
        authenticatedUser.id,
        sessionToken,
        defaultSessionTimeoutMins,
        defaultDisableAutoLogout,
        debugMode
      );

      // Set up iron-session cookie
      session.isLoggedIn = true;
      session.userId = authenticatedUser.id;
      session.username = authenticatedUser.username;
      session.role = authenticatedUser.role;
      session.lastActivity = Date.now();
      session.sessionInactivityTimeoutMinutes = defaultSessionTimeoutMins;
      session.disableAutoLogoutOnInactivity = defaultDisableAutoLogout;

      await session.save();
      if (debugMode) console.log(`[LoginAction] Iron session cookie saved for ${authenticatedUser.username}.`);

      logEvent(authenticatedUser.username, authenticatedUser.role, 'LOGIN_SUCCESS', 'INFO');
      operationSuccessful = true;
      redirectPath = validatedFields.data.redirectUrl || '/';
    } else {
      if (debugMode) console.error("[LoginAction] AuthenticatedUser object was null after checks. This should not happen.");
      logEvent(username, 'Unknown', 'LOGIN_FAILED_NULL_USER', 'ERROR'); // Corrected usernameForLogging
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }
  } catch (e: any) {
    console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
    console.error("[LoginAction] Full error object caught:", e);
    console.error("[LoginAction] Error Message:", e.message);
    console.error("[LoginAction] Error Stack:", e.stack);

    let clientErrorMessage = "An unexpected server error occurred during login.";
    // Unconditionally include details for easier debugging during development
    clientErrorMessage = `An unexpected error occurred. ${e.message ? `Error: ${e.message}` : `Details: ${String(e)}`}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0, 250)}...` : ''}`;
    
    logEvent(username, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message, stack: e.stack }); // Corrected usernameForLogging
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { _form: [clientErrorMessage] },
    };
  }

  if (operationSuccessful && redirectPath) {
    if (debugMode) console.log(`[LoginAction] User ${username} login process completed. Redirecting to: ${redirectPath}`); // Corrected usernameForLogging
    redirect(redirectPath);
  }

  // Fallback return, though redirect should prevent this.
  return { message: "Processing...", status: "idle" };
}
