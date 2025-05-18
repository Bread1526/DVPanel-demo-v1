
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/types';
import type { UserSettingsData } from './user-settings';

// Define the shape of the data stored in the iron-session cookie
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'];
  lastActivity?: number;
  // These are set at login based on global settings, but stored per session
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// Define the shape of the authenticated user object returned by /api/auth/user
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'];
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  userSettings?: UserSettingsData; // User-specific settings (popups)
  globalDebugMode?: boolean; // Global debug mode flag from panel settings
};

// This type was for the server-side session files ({username}-{role}-Auth.json)
export type FileSessionData = {
  userId: string;
  username: string;
  role: UserData['role'];
  token: string; // The unique session token stored in this file
  createdAt: number;
  lastActivity: number;
  sessionInactivityTimeoutMinutes: number;
  disableAutoLogoutOnInactivity: boolean;
};

export const sessionOptions: IronSessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'dvpanel_session',
  password: process.env.SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    // maxAge: undefined by default (session cookie), or set for "keep me logged in"
    // path: '/',
  },
};

if (!process.env.SESSION_PASSWORD || process.env.SESSION_PASSWORD.length < 32) {
  console.error(
    'CRITICAL SECURITY WARNING: SESSION_PASSWORD environment variable is not set or is less than 32 characters long. ' +
      'This is required for secure session cookie encryption. The application may not function correctly or securely. ' +
      'Please set a strong secret in your .env.local file.'
  );
}
