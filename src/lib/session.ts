
// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/(app)/roles/actions';

export interface SessionData {
  user?: {
    id: string;
    username: string;
    role: UserData['role'] | 'Owner'; // Allow 'Owner' role
  };
  isLoggedIn: boolean;
  lastActivity?: number; // Timestamp of last recorded activity
}

export const sessionOptions: IronSessionOptions = {
  cookieName: 'dvpanel_session',
  password: process.env.SESSION_PASSWORD as string, // Must be set in .env.local
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    sameSite: 'lax',
    // maxAge can be set here if you want a fixed absolute timeout.
    // By default, iron-session creates session cookies (expire when browser closes).
    // If we set maxAge, and then refresh by re-saving, it acts like a rolling session.
    // For example, maxAge: 60 * 60 * 24 (24 hours)
  },
};

// This is where we specify the typings of req.session.*
declare module 'iron-session' {
  interface IronSessionData extends SessionData {}
}
