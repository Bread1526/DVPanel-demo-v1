
'use server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function updateSessionActivity() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (session.isLoggedIn) {
    session.lastActivity = Date.now();
    await session.save(); // This re-saves the session, extending the cookie's expiration
    // console.log('[SessionActions] Session activity updated and cookie refreshed.');
    return { success: true, message: 'Session activity updated.' };
  }
  return { success: false, message: 'User not logged in.' };
}
