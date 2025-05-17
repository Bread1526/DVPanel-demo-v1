// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/actions'; // Assuming UserData defines role types

// Define the shape of the data stored in the session
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: UserData['role'] | 'Owner'; // To accommodate the special "Owner" role
  lastActivity?: number; // Timestamp of last recorded activity
  // Session-specific inactivity settings, copied from global settings at session creation
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// Define the shape of the authenticated user object you might pass around
// (excluding sensitive session-only data like lastActivity or timeout settings)
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserData['role'] | 'Owner';
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
};


// Define the shape of the data stored in the server-side session file (e.g., {username}-{role}-Auth.json)
// This is distinct from what's stored in the iron-session cookie.
export type FileSessionData = {
  userId: string;
  username: string;
  role: UserData['role'] | 'Owner';
  token: string; // The unique session token stored in the file
  createdAt: number; // Timestamp of session creation
  lastActivity: number; // Timestamp of last recorded activity
  sessionInactivityTimeoutMinutes: number;
  disableAutoLogoutOnInactivity: boolean;
};


export const sessionOptions: IronSessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || 'dvpanel_session',
  password: process.env.SESSION_PASSWORD as string, // Must be set in .env.local, at least 32 characters long
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true, // Prevent client-side JavaScript access to the cookie
    sameSite: 'lax', // CSRF protection
    // maxAge: undefined, // Session cookie by default, or set a duration for "keep me logged in"
    // path: '/', // Default is '/', applies to all paths
  },
};

// Ensure SESSION_PASSWORD is set
if (!process.env.SESSION_PASSWORD || process.env.SESSION_PASSWORD.length < 32) {
  throw new Error(
    'SESSION_PASSWORD environment variable is not set or is less than 32 characters long. ' +
    'Please set a strong secret in your .env.local file.'
  );
}
