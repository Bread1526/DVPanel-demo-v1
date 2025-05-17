
"use server";

import { z } from "zod";
import crypto from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { 
  loadUserById, 
  verifyPassword, 
  ensureOwnerFileExists, 
  type UserData 
} from '@/app/(app)/roles/actions';
import { loadPanelSettings } from "@/app/(app)/settings/actions";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { userSettingsSchema, defaultUserSettings, type UserSettingsData } from "@/lib/user-settings";
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

async function ensureUserSpecificSettingsFile(username: string, role: string): Promise<UserSettingsData> {
  const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
  const settingsFilename = `${safeUsername}-${safeRole}-settings.json`;

  try {
    const existingSettings = await loadEncryptedData(settingsFilename);
    if (existingSettings) {
      const parsed = userSettingsSchema.safeParse(existingSettings);
      if (parsed.success) {
        return parsed.data;
      }
      console.warn(`[LoginAction] User-specific settings file ${settingsFilename} was corrupted. Applying defaults.`);
    }
  } catch (e) {
    console.warn(`[LoginAction] Could not load user-specific settings file ${settingsFilename}. Applying defaults. Error:`, e);
  }
  // If file doesn't exist, is invalid, or error loading, create/overwrite with defaults
  await saveEncryptedData(settingsFilename, defaultUserSettings);
  return defaultUserSettings;
}


export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const panelGlobalSettingsResult = await loadPanelSettings();
  // User's debugMode isn't known yet, so use global settings debugMode for this action's logging
  const debugModeForLoginAction = false; // For now, keep login action logging minimal unless specific need

  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if (debugModeForLoginAction) {
    console.log(`[LoginAction] Attempting login. Owner ENV: ${ownerUsernameEnv ? 'Set' : 'Not Set'}`);
  }

  const rawFormData = {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectUrl: String(formData.get("redirectUrl") ?? "/"),
    keepLoggedIn: formData.get("keepLoggedIn") === "on",
  };

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    if (debugModeForLoginAction) {
      console.error("[LoginAction] Zod validation failed:", JSON.stringify(flatErrors, null, 2));
    }
    logEvent(rawFormData.username || 'UnknownUser', 'Unknown', 'LOGIN_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    return {
      message: "Please check the form for errors.",
      status: "validation_failed",
      errors: { ...flatErrors.fieldErrors, _form: flatErrors.formErrors.length > 0 ? flatErrors.formErrors : undefined },
    };
  }

  const { username, password, redirectUrl, keepLoggedIn } = validatedFields.data;
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  try {
    let authenticatedUser: UserData | null = null;
    let authenticatedRole: SessionData['role'] | null = null;

    // Try .env owner login first
    if (ownerUsernameEnv && ownerPasswordEnv) {
      if (username === ownerUsernameEnv && password === ownerPasswordEnv) {
        if (debugModeForLoginAction) {
          console.log(`[LoginAction] Matched .env.local owner: ${ownerUsernameEnv}.`);
        }
        await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelGlobalSettingsResult.data);
        
        authenticatedUser = {
            id: 'owner_root',
            username: ownerUsernameEnv,
            hashedPassword: '', // Not needed for session, actual hash is in owner file
            salt: '',           // Not needed for session
            role: 'Owner',
            status: 'Active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        authenticatedRole = 'Owner';
      } else if (debugModeForLoginAction && username === ownerUsernameEnv) {
        console.log("[LoginAction] Owner username matched, but password did not.");
      }
    }

    // If not authenticated as owner, try regular user login from files
    if (!authenticatedUser) {
      if (debugModeForLoginAction) console.log("[LoginAction] Attempting login for regular user:", username);
      
      const usersResult = await loadUsers(); // This loads all individual user files
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
      authenticatedUser = userFromFile;
      authenticatedRole = userFromFile.role;
    }

    // If authentication successful (either owner or regular user)
    if (authenticatedUser && authenticatedRole) {
      await ensureUserSpecificSettingsFile(authenticatedUser.username, authenticatedRole);

      session.isLoggedIn = true;
      session.userId = authenticatedUser.id;
      session.username = authenticatedUser.username;
      session.role = authenticatedRole;
      session.lastActivity = Date.now();
      
      // Store global panel settings for session inactivity into the iron-session
      session.sessionInactivityTimeoutMinutes = panelGlobalSettingsResult.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelGlobalSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;

      const cookieOptions = keepLoggedIn ? { maxAge: 60 * 60 * 24 * 30 } : {}; // 30 days or session
      await session.save(cookieOptions);

      logEvent(authenticatedUser.username, authenticatedRole, 'LOGIN_SUCCESS', 'INFO');
      if (debugModeForLoginAction) {
        console.log(`[LoginAction] User ${authenticatedUser.username} login successful. Session cookie set.`);
      }
      // Perform server-side redirect
      redirect(redirectUrl || '/'); 
      // This return is mostly for type consistency, redirect will prevent it from being sent
      return { message: "Login successful! Redirecting...", status: "success" };
    } else {
      // This case should ideally be caught by earlier checks
      logEvent(username, 'Unknown', 'LOGIN_FAILED_UNKNOWN_REASON', 'ERROR');
      return { message: "Invalid username or password.", status: "error", errors: { _form: ["Invalid username or password."] } };
    }

  } catch (error: any) {
    console.error("[LoginAction] Unexpected login error:", error.message, error.stack);
    logEvent(username, 'Unknown', 'LOGIN_EXCEPTION', 'ERROR', { error: error.message });
    return { 
      message: `An unexpected error occurred. ${debugModeForLoginAction ? error.message : ''}`, 
      status: "error", 
      errors: { _form: [`An unexpected error occurred. ${debugModeForLoginAction ? error.message : ''}`] } 
    };
  }
}
