
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUserById, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions'; 
import { loadPanelSettings, type PanelSettingsData } from '@/app/(app)/settings/actions';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { logEvent } from '@/lib/logger';
import { LoginSchema, type LoginState } from './types';
import type { FileSessionData } from '@/lib/session';

// Helper function to create/update the server-side session file
async function createOrUpdateServerSessionFile(
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
    username, // Store original username
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
    // Re-throw with a more specific message to be caught by the main login action's catch block
    throw new Error(`Failed to establish session on server (file save error for ${sessionFilename}): ${error.message}`);
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  let usernameForLogging = String(formData.get("username") ?? "UnknownUser");
  let operationSuccessful = false;
  let redirectPath: string | null = null;

  // Load global panel settings to determine debug mode for logging
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  if (debugMode) {
    console.log("[LoginAction] OWNER_USERNAME from .env.local:", process.env.OWNER_USERNAME ? `Set (val: ${process.env.OWNER_USERNAME})` : "Not Set");
    console.log("[LoginAction] OWNER_PASSWORD from .env.local is set:", process.env.OWNER_PASSWORD ? "Yes" : "No");
  }
  
  try {
    const rawFormData = {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectUrl: String(formData.get("redirectUrl") ?? "/"),
      keepLoggedIn: formData.get("keepLoggedIn") === "on",
    };
    usernameForLogging = rawFormData.username || "UnknownUser";

    if (debugMode) {
      console.log("[LoginAction] Raw form data extracted for Zod:", rawFormData);
    }

    const validatedFields = LoginSchema.safeParse(rawFormData);

    if (!validatedFields.success) {
      const flatErrors = validatedFields.error.flatten();
      if (debugMode) {
        console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
      }
      logEvent(usernameForLogging, 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
      return {
        message: "Please check the form for errors.",
        status: "validation_failed",
        errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
      };
    }

    const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    let authenticatedUser: Pick<UserData, 'id' | 'username' | 'role' | 'status'> | null = null;
    
    // Determine default inactivity settings from global panel settings
    const defaultSessionTimeoutMins = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
    const defaultDisableAutoLogout = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

    if (ownerUsernameEnv && username === ownerUsernameEnv) {
      if (debugMode) console.log("[LoginAction] Attempting login as .env.local Owner:", ownerUsernameEnv);
      if (password === ownerPasswordEnv) {
        if (debugMode) console.log("[LoginAction] .env.local Owner credentials MATCHED.");
        // Pass panelGlobalSettingsResult.data to ensureOwnerFileExists
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
      // Attempt to load user by username from individual files
      // This requires scanning, or if loadUserById can handle username for non-owner.
      // For now, let's assume loadUserById is primarily for ID or owner. We need a loadUserByUsername.
      // Let's adjust: load the user profile file directly.
      
      // Try to find the user by iterating through roles as filename contains role.
      // This is not ideal. A better approach would be to store users in a way that username is primary key or indexed.
      // For now, we'll try to guess the file if possible, or this part needs rework for multi-user login.
      // The current structure with individual files means we need to know the role to find the file by username.
      // This part will effectively only work if we can guess the role or if user data is structured differently.
      // For simplicity, let's assume we'd need a loadUserByUsername that scans.
      // The provided loadUserById is used by /api/auth/user, let's assume it works for this simplified owner-only login for now.
      // If we were to support multi-user login from files:
      let foundUser: UserData | null = null;
      const potentialRoles: UserData['role'][] = ["Administrator", "Admin", "Custom"];
      for (const role of potentialRoles) {
          const userFilePath = `${username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${role.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
          const loadedData = await loadEncryptedData(userFilePath) as UserData | null;
          if (loadedData && loadedData.username === username) {
              foundUser = loadedData;
              break;
          }
      }

      if (!foundUser) {
        if (debugMode) console.warn(`[LoginAction] Regular user "${username}" not found in any user file.`);
        logEvent(username, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }

      if (foundUser.status === 'Inactive') {
        if (debugMode) console.warn(`[LoginAction] User "${username}" account is inactive.`);
        logEvent(username, foundUser.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
      }

      const isPasswordValid = await verifyPassword(password, foundUser.hashedPassword, foundUser.salt);
      if (!isPasswordValid) {
        if (debugMode) console.warn(`[LoginAction] Invalid password for user "${username}".`);
        logEvent(username, foundUser.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUser = foundUser;
      if (debugMode) console.log(`[LoginAction] Regular user "${username}" login successful. User data for session:`, authenticatedUser);
    }

    if (authenticatedUser) {
      // Create/Update the server-side session file with a token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await createOrUpdateServerSessionFile(
        authenticatedUser.username,
        authenticatedUser.role,
        authenticatedUser.id,
        sessionToken, // This token is stored in the file, not the cookie.
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
      // Store the session inactivity settings active at the time of login IN THE COOKIE
      session.sessionInactivityTimeoutMinutes = defaultSessionTimeoutMins;
      session.disableAutoLogoutOnInactivity = defaultDisableAutoLogout;

      if (keepLoggedIn) {
        // This maxAge is for the iron-session cookie itself
        sessionOptions.cookieOptions.maxAge = 60 * 60 * 24 * 30; // 30 days
      } else {
        // Use default session cookie (expires when browser closes)
        delete sessionOptions.cookieOptions.maxAge; 
      }
      await session.save();
      if (debugMode) console.log(`[LoginAction] Iron session cookie saved for ${authenticatedUser.username}. Keep Logged In: ${keepLoggedIn}. MaxAge: ${sessionOptions.cookieOptions.maxAge}`);

      logEvent(authenticatedUser.username, authenticatedUser.role, 'LOGIN_SUCCESS', 'INFO');
      operationSuccessful = true;
      redirectPath = redirectUrl || '/';
    } else {
      // This case should ideally not be reached if logic above is correct
      if (debugMode) console.error("[LoginAction] AuthenticatedUser object was null after checks. This should not happen.");
      logEvent(usernameForLogging, 'Unknown', 'LOGIN_FAILED_NULL_USER', 'ERROR');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }
  } catch (e: any) {
    // Unconditional server-side logging for any caught error
    console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
    console.error("[LoginAction] Full error object caught:", e);
    console.error("[LoginAction] Error Message:", e.message);
    console.error("[LoginAction] Error Stack:", e.stack);

    // Construct client error message
    // For testing, always include details. For production, only if debugMode is true.
    // const clientShouldSeeDetails = debugMode; // For production
    const clientShouldSeeDetails = true; // For current testing

    let clientErrorMessage = "An unexpected server error occurred during login.";
    if (clientShouldSeeDetails) {
        clientErrorMessage = `An unexpected error occurred. ${e.message ? `Error: ${e.message}` : `Details: ${String(e)}`}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0, 150)}...` : ''}`;
    }
    
    logEvent(usernameForLogging, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message, stack: e.stack });
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { _form: [clientErrorMessage] },
    };
  }

  // If operation was successful, proceed to redirect.
  // This ensures redirect is not called within the try...catch for NEXT_REDIRECT.
  if (operationSuccessful && redirectPath) {
    if (debugMode) console.log(`[LoginAction] User ${usernameForLogging} login process completed. Redirecting to: ${redirectPath}`);
    redirect(redirectPath);
  }

  // Fallback return, though redirect should prevent this.
  return { message: "Processing...", status: "idle" };
}
