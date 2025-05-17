
import type { IronSessionOptions } from 'iron-session';
import type { UserData as RolesUserData } from '@/app/(app)/roles/types'; 
import type { UserSettingsData } from './user-settings';

// Define the shape of the data stored in the iron-session cookie
export interface SessionData {
  isLoggedIn: boolean;
  userId?: string;
  username?: string;
  role?: RolesUserData['role']; // Uses role type from roles/types.ts
  lastActivity?: number; 
  sessionInactivityTimeoutMinutes?: number;
  disableAutoLogoutOnInactivity?: boolean;
}

// Define the shape of the authenticated user object returned by /api/auth/user
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: RolesUserData['role'];
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
  userSettings?: UserSettingsData;
};

// Session data for server-side files (e.g. {username}-{role}-Auth.json)
export type FileSessionData = {
  userId: string;
  username: string;
  role: RolesUserData['role'];
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
  },
};

if (!process.env.SESSION_PASSWORD || process.env.SESSION_PASSWORD.length < 32) {
  console.error(
    'CRITICAL SECURITY WARNING: SESSION_PASSWORD environment variable is not set or is less than 32 characters long. ' +
    'This is required for secure session cookie encryption. The application may not function correctly or securely. ' +
    'Please set a strong secret in your .env.local file.'
  );
}
