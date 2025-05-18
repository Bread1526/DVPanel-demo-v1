// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/types';
import type { UserSettingsData } from './user-settings';

export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'] | 'Owner';
  lastActivity?: number;
  // Stored from global panel settings at the time of login
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// This is what AppShell and other client components will typically use.
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'] | 'Owner';
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  userSettings?: UserSettingsData;
  globalDebugMode?: boolean;
};

// For the server-side session files ({username}-{role}-Auth.json)
export type FileSessionData = {
  userId: string;
  username: string;
  role: UserData['role'] | 'Owner';
  token: string; // The unique session token stored in this file
  createdAt: number;
  lastActivity: number;
  sessionInactivityTimeoutMinutes: number;
  disableAutoLogoutOnInactivity: boolean;
};

const sessionPassword = process.env.SESSION_PASSWORD;

// Explicit log to see what process.env.SESSION_PASSWORD resolves to
// This log runs once when the module is first loaded (server start)
console.log(
  '[SessionConfig] Raw SESSION_PASSWORD from process.env during module load:',
  sessionPassword ? `Set (length: ${sessionPassword.length})` : 'UNDEFINED'
);

if (!sessionPassword || sessionPassword.length < 32) {
  const errorMessage =
    '\n\nCRITICAL STARTUP ERROR:\n' +
    '-----------------------------------------------------------------------------------\n' +
    'SESSION_PASSWORD environment variable is NOT SET or is LESS THAN 32 characters long.\n' +
    'This is REQUIRED for secure session cookie encryption.\n' +
    'DVPanel WILL NOT START without it.\n' +
    'Please set a strong, unique secret (at least 32 characters) in your .env.local file.\n' +
    'Example: SESSION_PASSWORD="a_very_long_random_and_secure_string_for_sessions"\n' +
    `CURRENTLY READ VALUE: ${sessionPassword ? `'${sessionPassword.substring(0, 5)}...' (length ${sessionPassword.length})` : 'UNDEFINED'}\n` +
    '-----------------------------------------------------------------------------------\n\n';
  console.error(errorMessage);
  throw new Error("FATAL: SESSION_PASSWORD is not configured correctly. Halting server startup. Please check your .env.local file and server logs.");
}

export const sessionOptions: IronSessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'dvpanel_session',
  password: sessionPassword as string, // Cast to string, after the check above
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    // maxAge: undefined by default (session cookie), or set for "keep me logged in" in login action
    // path: '/',
  },
};

// Log the final sessionOptions object for debugging
// This also runs once when the module is first loaded.
if (process.env.NODE_ENV === 'development') {
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
