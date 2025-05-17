
'use server';

import { z } from "zod";
import crypto from "crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData, type FileSessionData } from '@/lib/session';
import { loadUsers, verifyPassword, ensureOwnerFileExists, type UserData, loadUserById } from '@/app/(app)/roles/actions';
import type { PanelSettingsData } from '@/app/(app)/settings/types';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { saveEncryptedData } from "@/backend/services/storageService";
import { logEvent } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';
import { getDataPath } from '@/backend/lib/config';
import { LoginSchema, type LoginState } from './types';

async function createOrUpdateServerSessionFile(
  userId: string,
  username: string,
  role: string,
  panelSettings: PanelSettingsData | null,
  debugMode: boolean
): Promise<void> {
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
  const sessionToken = crypto.randomBytes(32).toString('hex'); // Unique token for this session file
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
    await saveEncryptedData(sessionFilename, fileSessionData);
    if (debugMode) {
      console.log(`[LoginAction - createOrUpdateServerSessionFile] Server session file ${sessionFilename} created/updated for ${username}.`);
    }
  } catch (e: any) {
    const errorMessage = `Failed to establish server session state for ${username}: ${e.message}`;
    console.error(`[LoginAction - createOrUpdateServerSessionFile] CRITICAL: ${errorMessage}`, e.stack);
    logEvent(username, role, 'LOGIN_SERVER_SESSION_FILE_SAVE_FAILED', 'ERROR', { error: e.message });
    throw new Error(errorMessage);
  }
}

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  const debugMode = panelGlobalSettingsResult.data?.debugMode ?? false;

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if (debugMode) {
    console.log(`[LoginAction] OWNER_USERNAME from .env.local: ${ownerUsernameEnv || "Not Set"}`);
    console.log(`[LoginAction] OWNER_PASSWORD from .env.local is set: ${ownerPasswordEnv ? 'Yes' : 'No'}`);
    const formDataEntries = Array.from(formData.entries());
    console.log("[LoginAction] FormData entries:", formDataEntries);
  }

  const rawFormData = {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectUrl: String(formData.get("redirectUrl") ?? "/"),
    keepLoggedIn: formData.get("keepLoggedIn") === "on",
  };
  
  if (debugMode) console.log("[LoginAction] Raw form data extracted for Zod:", {username: rawFormData.username, passwordExists: !!rawFormData.password, keepLoggedIn: rawFormData.keepLoggedIn});

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    if (debugMode) console.error("[LoginAction] Zod validation failed. Full errors:", JSON.stringify(flatErrors, null, 2));
    
    logEvent(rawFormData.username || 'UnknownUser', 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    
    const message = (flatErrors.fieldErrors.username || flatErrors.fieldErrors.password) 
                    ? "Please check the form for errors." 
                    : "Validation failed. Please provide all required information.";
    return { status: "validation_failed", message, errors: flatErrors.fieldErrors };
  }

  const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;
  let loginUsernameForLog = username;

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);
    let authenticatedUser: UserData | null = null;
    let authenticatedRole: SessionData['role'] | null = null;
    let authenticatedUserId: string | null = null;

    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (debugMode) console.log(`[LoginAction] Comparing with ENV Owner: Input username '${username}' vs ENV '${ownerUsernameEnv}'`);
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugMode) console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}. Ensuring owner file.`);
        const ownerDataFromFile = await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
        authenticatedUserId = ownerDataFromFile.id; 
        authenticatedUser = ownerDataFromFile;
        authenticatedRole = 'Owner';
        loginUsernameForLog = ownerDataFromFile.username;
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
        throw new Error(usersListResult.error || "Failed to load user list for authentication.");
      }
      const userFromFile = usersListResult.users.find(u => u.username === username);

      if (!userFromFile) {
        logEvent(username, 'Unknown', 'LOGIN_USER_NOT_FOUND', 'WARN');
        return { status: "error", message: "Invalid username or password.", errors: { _form: ["Invalid username or password."] } };
      }
      if (userFromFile.status === 'Inactive') {
        logEvent(username, userFromFile.role, 'LOGIN_USER_INACTIVE', 'WARN');
        return { status: "error", message: "This account is inactive. Please contact an administrator.", errors: { _form: ["This account is inactive."] } };
      }

      const isPasswordValid = await verifyPassword(password, userFromFile.hashedPassword, userFromFile.salt);
      if (!isPasswordValid) {
        logEvent(username, userFromFile.role, 'LOGIN_INVALID_PASSWORD', 'WARN');
        return { status: "error", message: "Invalid username or password.", errors: { _form: ["Invalid username or password."] } };
      }
      authenticatedUserId = userFromFile.id;
      authenticatedUser = userFromFile;
      authenticatedRole = userFromFile.role;
      loginUsernameForLog = userFromFile.username;
    }

    if (authenticatedUserId && authenticatedUser && authenticatedRole) {
      if (debugMode) console.log(`[LoginAction] Auth successful for ${authenticatedUser.username}. Role: ${authenticatedRole}. UserID: ${authenticatedUserId}. Creating server session file and iron-session cookie.`);

      await createOrUpdateServerSessionFile(
        authenticatedUserId,
        authenticatedUser.username,
        authenticatedRole,
        panelGlobalSettingsResult.data,
        debugMode
      );
      
      session.isLoggedIn = true;
      session.userId = authenticatedUserId;
      session.username = authenticatedUser.username;
      session.role = authenticatedRole;
      session.lastActivity = Date.now();
      session.sessionInactivityTimeoutMinutes = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

      const cookieOptions = keepLoggedIn ? { maxAge: 60 * 60 * 24 * 30 } : {}; // 30 days if keepLoggedIn
      await session.save(cookieOptions);

      logEvent(authenticatedUser.username, authenticatedRole, 'LOGIN_SUCCESS', 'INFO');
      if (debugMode) console.log(`[LoginAction] User ${authenticatedUser.username} login successful. Iron-session cookie set. Redirecting to: ${redirectUrl || '/'}`);
      
      redirect(redirectUrl || '/'); 
    } else {
      logEvent(username, 'Unknown', 'LOGIN_FAILED_INVALID_CREDENTIALS', 'WARN');
      return { status: "error", message: "Invalid username or password.", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (e: any) {
    let clientErrorMessage = "An unexpected server error occurred during login.";
    if (debugMode) {
        console.error("[LoginAction] CRITICAL LOGIN ERROR CAUGHT:");
        console.error("[LoginAction] Error Message:", e.message);
        console.error("[LoginAction] Error Stack:", e.stack);
        console.error("[LoginAction] Full error object caught:", e);
        clientErrorMessage = e.message ? `Login failed: ${e.message}` : `Login failed: ${String(e)}. Check server logs.`;
    }
    logEvent(loginUsernameForLog, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: e.message, stack: e.stack });
    return { status: "error", message: "An unexpected server error occurred during login.", errors: { _form: [clientErrorMessage] } };
  }
}
