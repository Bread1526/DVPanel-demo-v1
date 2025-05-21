
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData, type FileSessionData } from '@/lib/session';
import { loadUserById, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { type PanelSettingsData, explicitDefaultPanelSettings } from '@/app/(app)/settings/types';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { logEvent } from '@/lib/logger';
import { LoginSchema, type LoginState } from './types';
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from "fs/promises";
import { defaultUserSettings, userSettingsSchema, type UserSettingsData } from "@/lib/user-settings";

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
    console.error(`[LoginAction - createOrUpdateServerSessionFile] CRITICAL: Failed to save server session file ${sessionFilename} for ${username}:`, error);
    // Re-throw with more context to be caught by the main login action
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
      if (debugMode) console.warn(`[DeleteServerSessionFile] Server-side session file ${sessionFilename} not found for ${username}, presumed already deleted or not created.`);
    } else {
      console.error(`[DeleteServerSessionFile] Error deleting server-side session file ${sessionFilename} for ${username}:`, e);
    }
  }
}

// Helper function to ensure user-specific settings file exists
async function ensureUserSpecificSettingsFile(username: string, role: string, debugMode?: boolean): Promise<void> {
    const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
    const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;

    try {
        const existingSettings = await loadEncryptedData(settingsFilename);
        if (existingSettings === null) { // File doesn't exist or is empty/corrupt
            if (debugMode) {
                console.log(`[LoginAction - ensureUserSpecificSettingsFile] Settings file ${settingsFilename} not found for ${username}. Creating with defaults.`);
            }
            await saveEncryptedData(settingsFilename, defaultUserSettings);
        } else {
             // Optionally, validate existing settings and merge with defaults if schema changed
            const parsed = userSettingsSchema.safeParse(existingSettings);
            if (!parsed.success) {
                if (debugMode) {
                    console.warn(`[LoginAction - ensureUserSpecificSettingsFile] Settings file ${settingsFilename} for ${username} is invalid. Overwriting with defaults. Errors:`, parsed.error.flatten().fieldErrors);
                }
                await saveEncryptedData(settingsFilename, defaultUserSettings);
            } else if (debugMode) {
                 console.log(`[LoginAction - ensureUserSpecificSettingsFile] Settings file ${settingsFilename} for ${username} already exists and is valid.`);
            }
        }
    } catch (error: any) {
        console.error(`[LoginAction - ensureUserSpecificSettingsFile] Error ensuring user settings file ${settingsFilename} for ${username}:`, error);
        // Decide if this error should prevent login or just log. For now, we log and continue.
    }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectUrl = String(formData.get("redirectUrl") ?? "/");
  const keepLoggedIn = formData.get("keepLoggedIn") === "on";

  console.log(`[LoginAction] Attempting login for user: ${username || "'' (empty username)"}`);

  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;
  const globalSettingsForSession: PanelSettingsData = panelGlobalSettingsResult.data ?? explicitDefaultPanelSettings;


  if (debugMode) {
    console.log("[LoginAction] OWNER_USERNAME from .env.local:", process.env.OWNER_USERNAME ? `Set (val: ${process.env.OWNER_USERNAME})` : "Not Set");
    console.log("[LoginAction] OWNER_PASSWORD from .env.local is set:", process.env.OWNER_PASSWORD ? "Yes" : "No");
    console.log("[LoginAction] Default session timeout from global settings:", globalSettingsForSession.sessionInactivityTimeout, "Disable auto logout:", globalSettingsForSession.disableAutoLogoutOnInactivity);
  }

  let operationSuccessful = false;
  let redirectPath: string | null = null;
  let authenticatedUserDetails: { id: string; username: string; role: UserData['role'] | 'Owner'; status: 'Active' | 'Inactive' } | null = null;


  try {
    const rawFormData = { username, password, redirectUrl, keepLoggedIn };
    const validatedFields = LoginSchema.safeParse(rawFormData);

    if (!validatedFields.success) {
      const flatErrors = validatedFields.error.flatten();
      if (debugMode) {
        console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
      }
      let clientMessage = "Please check the form for errors.";
      if (debugMode && flatErrors.formErrors.length > 0) {
        clientMessage = flatErrors.formErrors.join('; ');
      } else if (debugMode && Object.keys(flatErrors.fieldErrors).length > 0) {
        // If only field errors, keep message generic for UI field display
      }
      logEvent(username, 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
      return {
        message: clientMessage,
        status: "validation_failed",
        errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
      };
    }

    const { username: validatedUsername, password: validatedPassword, redirectUrl: validatedRedirectUrl } = validatedFields.data;

    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    if (ownerUsernameEnv && validatedUsername === ownerUsernameEnv) {
      if (debugMode) console.log("[LoginAction] Attempting login as .env.local Owner:", ownerUsernameEnv);
      if (validatedPassword === ownerPasswordEnv) {
        if (debugMode) console.log("[LoginAction] .env.local Owner credentials MATCHED.");
        await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
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
      const usersResult = await loadUsers();
      const userToAuth = usersResult.users?.find(u => u.username === validatedUsername);

      if (!userToAuth) {
        if (debugMode) console.warn(`[LoginAction] Regular user "${validatedUsername}" not found.`);
        logEvent(validatedUsername, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }

      if (userToAuth.status === 'Inactive') {
        if (debugMode) console.warn(`[LoginAction] User "${validatedUsername}" account is inactive.`);
        logEvent(validatedUsername, userToAuth.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
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
      
      // Ensure user-specific settings file exists
      await ensureUserSpecificSettingsFile(authenticatedUserDetails.username, authenticatedUserDetails.role, debugMode);

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

      session.isLoggedIn = true;
      session.userId = authenticatedUserDetails.id;
      session.username = authenticatedUserDetails.username;
      session.role = authenticatedUserDetails.role;
      session.lastActivity = Date.now();
      session.sessionInactivityTimeoutMinutes = globalSettingsForSession.sessionInactivityTimeout;
      session.disableAutoLogoutOnInactivity = globalSettingsForSession.disableAutoLogoutOnInactivity;
      
      const cookieMaxAge = keepLoggedIn ? 60 * 60 * 24 * 30 : undefined; // 30 days or session
      await session.save({ ...sessionOptions.cookieOptions, maxAge: cookieMaxAge });

      if (debugMode) console.log(`[LoginAction] Iron session cookie saved for ${authenticatedUserDetails.username}. MaxAge: ${cookieMaxAge ? `${cookieMaxAge / (60*60*24)} days` : 'Session'}`);

      logEvent(authenticatedUserDetails.username, authenticatedUserDetails.role, 'LOGIN_SUCCESS', 'INFO');
      operationSuccessful = true;
      redirectPath = validatedRedirectUrl || '/';
    } else {
      // This case should ideally not be reached if previous checks are exhaustive
      if (debugMode) console.error("[LoginAction] AuthenticatedUserDetails object was null after checks. This indicates a logic flaw.");
      logEvent(validatedUsername, 'Unknown', 'LOGIN_FAILED_NULL_USER', 'ERROR');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (e: any) {
    console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
    console.error("[LoginAction] Full error object caught:", e);
    console.error("[LoginAction] Error Message:", e.message);
    console.error("[LoginAction] Error Stack:", e.stack);

    let clientErrorMessage = "An unexpected server error occurred during login.";
    // Unconditionally include details for easier debugging for now
    clientErrorMessage = `An unexpected error occurred. ${e.message ? `Error: ${e.message}` : `Details: ${String(e)}`}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0, 150)}...` : ''}`;
    
    logEvent(username, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message, stack: e.stack });
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { _form: [clientErrorMessage] },
    };
  }

  if (operationSuccessful && redirectPath) {
    if (debugMode) console.log(`[LoginAction] User ${username} login process completed. Redirecting to: ${redirectPath}`);
    redirect(redirectPath);
  }

  // Fallback, should ideally be unreachable due to redirect or error returns
  return { message: "Login processing finished without explicit redirect or error.", status: "error", errors: { _form: ["Login processing error."] } };
}
