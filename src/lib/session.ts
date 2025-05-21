
// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/types';
// Removed: import type { UserSettingsData } from './user-settings';
import type { PanelSettingsData, PanelPopupSettingsData } from '@/app/(app)/settings/types'; // Import global settings types

// Define the shape of the data stored in the session (cookie)
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'] | 'Owner';
  lastActivity?: number;
  // Store global panel settings for inactivity at the time of login
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;

  // Impersonation fields
  isImpersonating?: boolean;
  originalUserId?: string;
  originalUsername?: string;
  originalUserRole?: UserData['role'] | 'Owner';
}

// Define the shape of the user object returned by /api/auth/user
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'] | 'Owner';
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  // User-specific settings are removed. Global settings are passed instead.
  // userSettings?: UserSettingsData; 
  globalDebugMode?: boolean;
  globalPopupSettings?: PanelPopupSettingsData;


  // Impersonation fields for client
  isImpersonating?: boolean;
  originalUsername?: string;
};

// Define the shape of the server-side session files ({username}-{role}-Auth.json)
export type FileSessionData = {
  userId: string; 
  username: string; 
  role: string;     
  token: string;    
  createdAt: number;
  lastActivity: number;
  sessionInactivityTimeoutMinutes: number;
  disableAutoLogoutOnInactivity: boolean;
};


// --- Session Configuration ---
const sessionPassword = process.env.SESSION_PASSWORD;

console.log(
  '[SessionConfig] Raw SESSION_PASSWORD from process.env during module load:',
  sessionPassword ? `Set (length: ${sessionPassword.length})` : 'UNDEFINED or empty'
);

if (!sessionPassword || sessionPassword.length < 32) {
  const errorMessage =
    '\n\nCRITICAL STARTUP ERROR:\n' +
    '-----------------------------------------------------------------------------------\n' +
    'SESSION_PASSWORD environment variable is NOT SET or is LESS THAN 32 characters long.\n' +
    'This is REQUIRED for secure session cookie encryption.\n' +
    'DVPanel WILL NOT START without it.\n' +
    'Please set a strong, unique secret (at least 32 characters) in your .env.local file, \n' +
    'located in the ROOT directory of your project (same level as package.json).\n' +
    'Example: SESSION_PASSWORD="a_very_long_random_and_secure_string_for_sessions"\n' +
    `CURRENTLY READ VALUE (if any): ${sessionPassword ? `'${sessionPassword.substring(0, 5)}...' (length ${sessionPassword.length})` : 'UNDEFINED or empty'}\n`+
    '-----------------------------------------------------------------------------------\n' +
    'TROUBLESHOOTING:\n' +
    '1. Ensure .env.local is in the project ROOT.\n' +
    '2. Ensure SESSION_PASSWORD in .env.local is AT LEAST 32 characters long and NOT commented out.\n' +
    '3. COMPLETELY RESTART your Next.js development server after correcting .env.local.\n' +
    '-----------------------------------------------------------------------------------\n';
  console.error(errorMessage);
  throw new Error("FATAL: SESSION_PASSWORD is not configured correctly. Halting server startup. Please check your .env.local file and server logs.");
}

export const sessionOptions: IronSessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'dvpanel_session_v2',
  password: sessionPassword, 
  cookieOptions: {
    secure: true, 
    httpOnly: true,
    sameSite: 'none', 
    maxAge: undefined, // Default to session cookie, can be overridden on session.save()
    path: '/',
  },
};

if (process.env.NODE_ENV === 'development' || (process.env.DVSPANEL_DEBUG_LOGGING === 'true')) {
  console.log(
    '[SessionConfig] Final sessionOptions object being exported:',
    {
      ...sessionOptions,
      password: sessionOptions.password
        ? `Set (length: ${sessionOptions.password.length})`
        : 'NOT SET IN OPTIONS OBJECT (this should not happen if startup checks passed)',
    }
  );
  console.log('[SessionConfig] Effective cookieOptions being used:', sessionOptions.cookieOptions);
}
