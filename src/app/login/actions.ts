
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData, type FileSessionData } from '@/lib/session';
import { loadUserById, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // Corrected path for settings actions
import { type PanelSettingsData, explicitDefaultPanelSettings } from '@/app/(app)/settings/types'; // Import types from types.ts
import { logEvent } from '@/lib/logger';
import { LoginSchema } from './types';
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from "fs/promises";
import { saveEncryptedData } from '@/backend/services/storageService'; // For user session files

// Helper function to create/update the server-side session file (e.g., {username}-{role}-Auth.json)
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
    const errorMessage = `Failed to save server session file ${sessionFilename} for ${username}: ${error.message || String(error)}`;
    console.error(`[LoginAction - createOrUpdateServerSessionFile] CRITICAL: ${errorMessage}`, error);
    throw new Error(errorMessage);
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
      if (debugMode) console.warn(`[DeleteServerSessionFile] Server-side session file ${sessionFilename} not found for ${username}, presumed already deleted or not created.`);
    } else {
      console.error(`[DeleteServerSessionFile] Error deleting server-side session file ${sessionFilename} for ${username}:`, e);
    }
  }
}


export async function login(prevState: any, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectUrlFromForm = String(formData.get("redirectUrl") ?? "/");
  const keepLoggedIn = formData.get("keepLoggedIn") === "on";

  // Log environment variables (be careful with logging sensitive info like passwords in production)
  console.log("[LoginAction] OWNER_USERNAME from .env.local:", process.env.OWNER_USERNAME ? `Set (val: ${process.env.OWNER_USERNAME})` : "Not Set");
  console.log("[LoginAction] OWNER_PASSWORD from .env.local is set:", process.env.OWNER_PASSWORD ? "Yes" : "No");
  console.log(`[LoginAction] Attempting login for user: ${username || "'' (empty username)"}. Keep Logged In: ${keepLoggedIn}`);

  const panelGlobalSettingsResult = await loadPanelSettings();
  const globalSettingsForSession: PanelSettingsData = panelGlobalSettingsResult.data ?? explicitDefaultPanelSettings;
  const debugMode = globalSettingsForSession.debugMode ?? false;

  if (debugMode) {
    const formDataEntries: Record<string, any> = {};
    formData.forEach((value, key) => { formDataEntries[key] = value; });
    console.log("[LoginAction] FormData entries:", formDataEntries);
  }

  let operationSuccessful = false;
  let redirectPath: string | null = null;
  
  try {
    const rawDataForZod = { username, password, redirectUrl: redirectUrlFromForm, keepLoggedIn };
     if (debugMode) console.log("[LoginAction] Raw data object passed to Zod:", rawDataForZod);
    const validatedFields = LoginSchema.safeParse(rawDataForZod);

    if (!validatedFields.success) {
      const flatErrors = validatedFields.error.flatten();
      if (debugMode) console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
      
      let clientMessage = "Please check the form for errors.";
      if(debugMode && flatErrors.formErrors.length > 0) {
        clientMessage = flatErrors.formErrors.join('; ');
      } else if (debugMode && Object.keys(flatErrors.fieldErrors).length > 0) {
        // Construct a message from field errors if no general form errors
        clientMessage = Object.values(flatErrors.fieldErrors).flat().join('; ');
      }

      logEvent(username, 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
      return {
        message: clientMessage,
        status: "validation_failed",
        errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
      };
    }

    const { username: validatedUsername, password: validatedPassword, redirectUrl: validatedRedirectUrl } = validatedFields.data;
    if (debugMode) console.log(`[LoginAction] Zod validation successful for username: ${validatedUsername}`);

    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;
    let authenticatedUserDetails: { id: string; username: string; role: UserData['role'] | 'Owner'; status: 'Active' | 'Inactive'; } | null = null;

    if (ownerUsernameEnv && validatedUsername === ownerUsernameEnv) {
      if (debugMode) console.log("[LoginAction] Attempting login as .env.local Owner:", ownerUsernameEnv);
      if (ownerPasswordEnv && validatedPassword === ownerPasswordEnv) {
        if (debugMode) console.log("[LoginAction] .env.local Owner credentials MATCHED.");
        await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, globalSettingsForSession);
        authenticatedUserDetails = {
            id: 'owner_root',
            username: ownerUsernameEnv,
            role: 'Owner',
            status: 'Active',
        };
      } else {
        if (debugMode) console.warn("[LoginAction] .env.local Owner username matched, but password DID NOT MATCH.");
        logEvent(validatedUsername, 'OwnerAttempt', 'LOGIN_OWNER_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
    } else {
      if (debugMode) console.log(`[LoginAction] Attempting login for regular user: ${validatedUsername}`);
      // Load non-owner users by scanning individual files
      const allUsersResult = await loadUsers(); 
      const userToAuth = allUsersResult.users?.find(u => u.username === validatedUsername);

      if (!userToAuth) {
        if (debugMode) console.warn(`[LoginAction] Regular user "${validatedUsername}" not found in loaded user files.`);
        logEvent(validatedUsername, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }

      if (userToAuth.status === 'Inactive') {
        if (debugMode) console.warn(`[LoginAction] User "${validatedUsername}" account is inactive.`);
        logEvent(validatedUsername, userToAuth.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
      }
      if (!userToAuth.hashedPassword || !userToAuth.salt) {
        console.error(`[LoginAction] User "${validatedUsername}" is missing hashedPassword or salt. Cannot authenticate.`);
        logEvent(validatedUsername, userToAuth.role, 'LOGIN_MISSING_HASH_SALT', 'ERROR');
        return { message: "Authentication configuration error for this user.", status: "error", errors: { _form: ["User account configuration error."] } };
      }

      const isPasswordValid = await verifyPassword(validatedPassword, userToAuth.hashedPassword, userToAuth.salt);
      if (!isPasswordValid) {
        if (debugMode) console.warn(`[LoginAction] Invalid password for user "${validatedUsername}".`);
        logEvent(validatedUsername, userToAuth.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUserDetails = userToAuth;
    }

    if (authenticatedUserDetails) {
      if (debugMode) console.log(`[LoginAction] User "${authenticatedUserDetails.username}" authenticated. Role: "${authenticatedUserDetails.role}".`);
      
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await createOrUpdateServerSessionFile(
        authenticatedUserDetails.username,
        authenticatedUserDetails.role,
        authenticatedUserDetails.id,
        sessionToken,
        globalSettingsForSession.sessionInactivityTimeout,
        globalSettingsForSession.disableAutoLogoutOnInactivity,
        debugMode
      );

      // User-specific settings file creation removed from here.
      // It will be handled by /api/auth/user if the file is missing or invalid.

      session.isLoggedIn = true;
      session.userId = authenticatedUserDetails.id;
      session.username = authenticatedUserDetails.username;
      session.role = authenticatedUserDetails.role;
      session.lastActivity = Date.now();
      session.sessionInactivityTimeoutMinutes = globalSettingsForSession.sessionInactivityTimeout;
      session.disableAutoLogoutOnInactivity = globalSettingsForSession.disableAutoLogoutOnInactivity;
      
      const cookieMaxAge = keepLoggedIn ? (sessionOptions.cookieOptions?.maxAge || (60 * 60 * 24 * 30)) : undefined; 
      await session.save();

      if (debugMode) console.log(`[LoginAction] Iron session cookie saved for ${authenticatedUserDetails.username}. MaxAge: ${cookieMaxAge ? `${cookieMaxAge / (60*60*24)} days` : 'Session'}`);

      logEvent(authenticatedUserDetails.username, authenticatedUserDetails.role, 'LOGIN_SUCCESS', 'INFO');
      operationSuccessful = true;
      redirectPath = validatedRedirectUrl || '/';
    } else {
      // This case should ideally not be reached if owner check or user check handles all scenarios
      console.error("[LoginAction] AuthenticatedUserDetails object was null after all checks. This indicates a logic flaw.");
      logEvent(validatedUsername, 'Unknown', 'LOGIN_FAILED_NULL_USER', 'ERROR');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (e: any) {
    // This catch block is for unexpected errors during the process.
    console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
    console.error("[LoginAction] Full error object caught:", e); 
    console.error("[LoginAction] Error Message:", e.message);
    console.error("[LoginAction] Error Stack:", e.stack);

    let clientErrorMessage = "An unexpected server error occurred during login.";
    // Unconditionally include e.message for better debugging from client side for now.
    clientErrorMessage = `An unexpected error occurred. ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0, 200)}...` : ''}`;
    
    logEvent(username, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message, stack: e.stack });
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { _form: [clientErrorMessage] },
    };
  }

  if (operationSuccessful && redirectPath) {
    if (debugMode) console.log(`[LoginAction] Operation successful. Redirecting to: ${redirectPath}`);
    redirect(redirectPath); // This call will throw NEXT_REDIRECT
  }
  
  // Fallback return, should not be reached if redirect or error state is returned properly
  console.warn("[LoginAction] Reached end of function without explicit redirect or error return. This should not happen.");
  return { message: "Login processing incomplete.", status: "error", errors: { _form: ["Login processing did not complete as expected."] } };
}


interface LoginState {
  message: string;
  status: 'idle' | 'success' | 'error' | 'validation_failed';
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | '_form', string[]>>;
}
