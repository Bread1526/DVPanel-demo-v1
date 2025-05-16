
// src/lib/session.ts
import type { IronSessionOptions } from 'iron-session';
import type { UserData } from '@/app/roles/actions'; // Assuming UserData includes id, username, role

export interface SessionData {
  user?: {
    id: string;
    username: string;
    role: UserData['role'];
    // Add other user fields you want in the session
  };
  isLoggedIn: boolean;
}

export const sessionOptions: IronSessionOptions = {
  cookieName: 'dvpanel_session',
  password: process.env.SESSION_PASSWORD as string, // Must be set in .env.local
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    sameSite: 'lax',
  },
};

// This is where we specify the typings of req.session.*
declare module 'iron-session' {
  interface IronSessionData extends SessionData {}
}
