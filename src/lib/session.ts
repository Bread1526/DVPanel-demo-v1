// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/types';
import type { UserSettingsData } from './user-settings';

// Define the shape of the data stored in the iron-session cookie
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'] | 'Owner'; // Allow 'Owner' explicitly
  lastActivity?: number;
  // These are set at login based on global settings, but stored per session
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// Define the shape of the authenticated user object returned by /api/auth/user
// This is what AppShell and other client components will typically use.
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'] | 'Owner';
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  userSettings?: UserSettingsData; // User-specific settings (popups, user debug)
  globalDebugMode?: boolean; // Global debug mode flag from panel settings
};

// This type is for the server-side session files ({username}-{role}-Auth.json)
// It stores the actual session token and detailed activity/timeout settings.
// This type definition is not used by iron-session itself but related to the custom file-based session logic.
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
console.log('[SessionConfig] Raw SESSION_PASSWORD from process.env before check:', sessionPassword);

if (!sessionPassword || sessionPassword.length < 32) {
  console.error(
    '\n\nCRITICAL SECURITY WARNING:\n' +
      '-----------------------------------------------------------------------------------\n' +
      'SESSION_PASSWORD environment variable is NOT SET or is LESS THAN 32 characters long.\n' +
      'This is REQUIRED for secure session cookie encryption.\n' +
      'DVPanel WILL NOT FUNCTION CORRECTLY OR SECURELY without it.\n' +
      'Please set a strong, unique secret (at least 32 characters) in your .env.local file.\n' +
      'Example: SESSION_PASSWORD="a_very_long_random_and_secure_string_for_sessions"\n' +
      '-----------------------------------------------------------------------------------\n\n'
  );
  // In a real production app, you would throw an error here to prevent startup.
  // For development, the prominent console warning is critical.
  // throw new Error("SESSION_PASSWORD is not configured correctly or is missing.");
}

export const sessionOptions: IronSessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'dvpanel_session',
  password: sessionPassword as string, // This line will cause a runtime error if sessionPassword is undefined
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    // maxAge: undefined by default (session cookie), or set for "keep me logged in" in login action
    // path: '/',
  },
};
