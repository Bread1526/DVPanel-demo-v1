
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword, ensureOwnerFileExists, type UserData } from '@/app/(app)/roles/actions';
import { loadPanelSettings } from "@/app/(app)/settings/actions";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { userSettingsSchema, defaultUserSettings, type UserSettingsData } from "@/lib/user-settings";
import { logEvent } from '@/lib/logger';
import { LoginSchema, type LoginState } from './types'; // Import from local types

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
  if (debugMode) {
    console.log(`[LoginAction - createOrUpdateServerSessionFile] Called for user: ${username}, role: ${role}`);
  }
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;

  const sessionFileData = {
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
    throw new Error(`Failed to establish session on server: ${error.message}`);
  }
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  // For this debugging step, we'll make client-side error reporting more verbose temporarily
  // const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  let usernameForLogging = String(formData.get("username") ?? "UnknownUser");

  console.log("[LoginAction] OWNER_USERNAME from .env.local:", process.env.OWNER_USERNAME ? `Set (val: ${process.env.OWNER_USERNAME})` : "Not Set");
  console.log("[LoginAction] OWNER_PASSWORD from .env.local is set:", process.env.OWNER_PASSWORD ? "Yes" : "No");

  try {
    const rawFormData = {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectUrl: String(formData.get("redirectUrl") ?? "/"),
      keepLoggedIn: formData.get("keepLoggedIn") === "on",
    };
    usernameForLogging = rawFormData.username || "UnknownUser"; // Update if username was empty

    console.log("[LoginAction] Raw form data extracted for Zod:", rawFormData);
    const validatedFields = LoginSchema.safeParse(rawFormData);

    if (!validatedFields.success) {
      const flatErrors = validatedFields.error.flatten();
      // Always log full Zod errors on server for diagnosis
      console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
      logEvent(usernameForLogging, 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
      return {
        message: "Please check the form for errors.", // Generic for UI
        status: "validation_failed",
        errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
      };
    }

    const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    let authenticatedUser: Pick<UserData, 'id' | 'username' | 'role' | 'status' | 'assignedPages' | 'allowedSettingsPages' | 'projects'> | null = null;
    let userSettings: UserSettingsData = defaultUserSettings;

    if (ownerUsernameEnv && ownerPasswordEnv && username === ownerUsernameEnv) {
      console.log("[LoginAction] Attempting login as .env.local Owner:", ownerUsernameEnv);
      if (password === ownerPasswordEnv) {
        console.log("[LoginAction] .env.local Owner credentials MATCHED.");
        await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
        
        authenticatedUser = {
            id: 'owner_root',
            username: ownerUsernameEnv,
            role: 'Owner',
            status: 'Active',
            assignedPages: [], // Owner has implicit access
            allowedSettingsPages: [], // Owner has implicit access
            projects: [], // Owner has implicit access
        };
        // Load or create owner-specific settings file
        const ownerSettingsFilename = `${ownerUsernameEnv.replace(/[^a-zA-Z0-9_.-]/g, '_')}-Owner-settings.json`;
        const loadedOwnerSettings = await loadEncryptedData(ownerSettingsFilename) as UserSettingsData | null;
        if (loadedOwnerSettings && userSettingsSchema.safeParse(loadedOwnerSettings).success) {
          userSettings = loadedOwnerSettings;
        } else {
          await saveEncryptedData(ownerSettingsFilename, defaultUserSettings);
          userSettings = defaultUserSettings;
        }
        console.log("[LoginAction] Owner login successful. User data:", authenticatedUser);
      } else {
        console.warn("[LoginAction] .env.local Owner username matched, but password DID NOT MATCH.");
        logEvent(username, 'OwnerAttempt', 'LOGIN_OWNER_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
    } else {
      console.log("[LoginAction] Attempting login for regular user:", username);
      const userFromFile = await loadUserById(username); // Assumes loadUserById can find by username if ID is not 'owner_root'

      if (!userFromFile || userFromFile.id === 'owner_root') { // Ensure it's not the owner record if owner login failed/skipped
        console.warn(`[LoginAction] Regular user "${username}" not found or was owner record.`);
        logEvent(username, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      if (userFromFile.status === 'Inactive') {
        console.warn(`[LoginAction] User "${username}" account is inactive.`);
        logEvent(username, userFromFile.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { message: "This account is inactive. Please contact an administrator.", status: "error", errors: { _form: ["This account is inactive."] } };
      }

      const isPasswordValid = await verifyPassword(password, userFromFile.hashedPassword, userFromFile.salt);
      if (!isPasswordValid) {
        console.warn(`[LoginAction] Invalid password for user "${username}".`);
        logEvent(username, userFromFile.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUser = userFromFile;
      // Load or create user-specific settings file
      const userSettingsFilename = `${userFromFile.username.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${userFromFile.role.replace(/[^a-zA-Z0-9]/g, '_')}-settings.json`;
      const loadedUserSettings = await loadEncryptedData(userSettingsFilename) as UserSettingsData | null;
      if (loadedUserSettings && userSettingsSchema.safeParse(loadedUserSettings).success) {
        userSettings = loadedUserSettings;
      } else {
        await saveEncryptedData(userSettingsFilename, defaultUserSettings);
        userSettings = defaultUserSettings;
      }
      console.log(`[LoginAction] Regular user "${username}" login successful. User data:`, authenticatedUser);
    }

    if (authenticatedUser) {
      session.isLoggedIn = true;
      session.userId = authenticatedUser.id;
      session.username = authenticatedUser.username;
      session.role = authenticatedUser.role;
      session.lastActivity = Date.now();
      
      session.sessionInactivityTimeoutMinutes = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

      if (keepLoggedIn) {
        sessionOptions.cookieOptions.maxAge = 60 * 60 * 24 * 30; // 30 days
      } else {
        delete sessionOptions.cookieOptions.maxAge; // Session cookie
      }
      await session.save();
      console.log(`[LoginAction] Iron session cookie saved for ${authenticatedUser.username}. Keep Logged In: ${keepLoggedIn}`);

      // For the file-based session token system (if co-existing or primary)
      // This part is from the previous file-based token system. We are using iron-session primarily now.
      // If we still want a server-side session file for activity even with iron-session, this can be kept.
      // For now, iron-session handles the cookie, and /api/auth/user revalidates against main user files.
      // The *-Auth.json files might be redundant if iron-session is the sole source of truth for "is session active".
      // For now, let's comment out the creation of the separate *-Auth.json for simplicity if iron-session is primary.
      /*
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await createOrUpdateServerSessionFile(
        authenticatedUser.username,
        authenticatedUser.role,
        authenticatedUser.id,
        sessionToken,
        session.sessionInactivityTimeoutMinutes,
        session.disableAutoLogoutOnInactivity,
        debugMode // Pass debugMode to this helper
      );
      */

      logEvent(authenticatedUser.username, authenticatedUser.role, 'LOGIN_SUCCESS', 'INFO');
      console.log(`[LoginAction] User ${authenticatedUser.username} login process completed. Redirecting to: ${redirectUrl || '/'}`);
      redirect(redirectUrl || '/');
      // This return is mostly for type consistency, redirect will prevent it from being sent
      // but if redirect were client-side, this would be relevant.
      return { 
        message: "Login successful! Redirecting...", 
        status: "success",
      };
    } else {
      // This case should not be reached if logic above is correct
      console.error("[LoginAction] AuthenticatedUser object was null after checks. This should not happen.");
      logEvent(username, 'Unknown', 'LOGIN_FAILED_NULL_USER', 'ERROR');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }
  } catch (e: any) {
    // Always log the full error details to the server console
    console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
    console.error("[LoginAction] Full error object caught:", e);
    console.error("[LoginAction] Error Message:", e.message);
    console.error("[LoginAction] Error Stack:", e.stack);

    // For client-side debugging, send a more detailed message, not just the generic one
    const clientErrorMessage = `An unexpected error occurred. ${e.message ? `Error: ${e.message}` : `Details: ${String(e)}`}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0, 200)}...` : ''}`;
    
    logEvent(usernameForLogging, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message, stack: e.stack });
    return {
      message: clientErrorMessage, // This message will be used by the toast if no specific field errors
      status: "error",
      errors: { _form: [clientErrorMessage] },
    };
  }
}
