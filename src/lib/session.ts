
// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/actions'; 
import type { UserSettingsData } from './user-settings'; // Import UserSettingsData

// Define the shape of the data stored in the iron-session cookie
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'] | 'Owner'; 
  lastActivity?: number; 
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// Define the shape of the authenticated user object returned by /api/auth/user
// This will now include user-specific settings.
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'] | 'Owner';
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  userSettings?: UserSettingsData; // User-specific settings
};

// Session data for server-side files (e.g. {username}-{role}-Auth.json)
// This is NOT for iron-session cookie. We are not using this file-based token approach currently.
// This type definition might be from a previous iteration.
// For current iron-session based approach, this is not directly used for session tokens.
// If we were to store a *separate* server-side session state that the cookie points to,
// this might be relevant, but current setup stores primary session identifiers in the cookie.
export type FileSessionData = {
  userId: string;
  username: string;
  role: UserData['role'] | 'Owner';
  token: string; 
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
  // Forcing an error here can prevent the app from starting in an insecure state.
  // throw new Error('SESSION_PASSWORD configuration error.');
}
