// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/types'; // Ensure this path is correct if roles/types.ts exists
import type { UserSettingsData } from './user-settings';

export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'] | 'Owner'; // Accommodate Owner role
  lastActivity?: number;
  // Stored from global panel settings at the time of login
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// This is what AppShell and other client components will typically use.
// It's enriched with user-specific settings and permissions.
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'] | 'Owner';
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  userSettings?: UserSettingsData;
  globalDebugMode?: boolean; // From global panel settings
};

// For the server-side session files ({username}-{role}-Auth.json)
// This stores the actual session token and specific settings for that live session.
export type FileSessionData = {
  userId: string;
  username: string;
  role: UserData['role'] | 'Owner';
  token: string; // The unique session token stored in this file
  createdAt: number;
  lastActivity: number;
  sessionInactivityTimeoutMinutes: number; // The timeout active for THIS session
  disableAutoLogoutOnInactivity: boolean; // The preference active for THIS session
};


const sessionPassword = process.env.SESSION_PASSWORD;

// Explicit log to see what process.env.SESSION_PASSWORD resolves to
// This log runs once when the module is first loaded (server start)
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
    'located in the ROOT directory of your project.\n' +
    'Example: SESSION_PASSWORD="a_very_long_random_and_secure_string_for_sessions"\n' +
    `CURRENTLY READ VALUE (if any, might be from another .env file if .env.local is missing/wrong): ${sessionPassword ? `'${sessionPassword.substring(0, 5)}...' (length ${sessionPassword.length})` : 'UNDEFINED or empty'}\n` +
    '-----------------------------------------------------------------------------------\n\n';
  console.error(errorMessage);
  // THIS ERROR MEANS YOUR .env.local FILE IS MISCONFIGURED OR THE SERVER WASN'T RESTARTED AFTER FIXING IT.
  // 1. Ensure .env.local is in the project root (same level as package.json).
  // 2. Ensure SESSION_PASSWORD in .env.local is at least 32 characters long and not commented out.
  // 3. Restart your Next.js development server COMPLETELY after correcting .env.local.
  throw new Error("FATAL: SESSION_PASSWORD is not configured correctly. Halting server startup. Please check your .env.local file and server logs.");
}

export const sessionOptions: IronSessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'dvpanel_session_v2', // Changed cookie name to potentially clear old ones
  password: sessionPassword as string, // Cast to string, after the check above
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    // maxAge: undefined by default (session cookie), or set for "keep me logged in" in login action
    path: '/',
  },
};

// Log the final sessionOptions object for debugging
// This also runs once when the module is first loaded.
if (process.env.NODE_ENV === 'development') { // Or a specific debug flag from .env
  console.log(
    '[SessionConfig] Final sessionOptions object being exported:',
    {
      ...sessionOptions,
      password: sessionOptions.password
        ? `Set (length: ${sessionOptions.password.length})`
        : 'NOT SET IN OPTIONS OBJECT (this should not happen if startup checks passed)',
    }
  );
}
