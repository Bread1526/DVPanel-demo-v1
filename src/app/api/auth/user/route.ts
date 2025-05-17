// src/app/api/auth/user/route.ts
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData, type SessionUser } from '@/lib/session';
import { loadUserById, type UserData, type FullUserData } from '@/app/(app)/roles/actions'; 

export async function GET() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ 
      user: null, 
      isLoggedIn: false, 
      isImpersonating: false, 
      originalUsername: null 
    }, { status: 200 });
  }

  let effectiveUser: FullUserData | null = null;
  let isImpersonating = false;
  let originalUsername: string | null = null;

  if (session.impersonatingUserId && session.originalUser) {
    const impersonatedUserDetails = await loadUserById(session.impersonatingUserId);
    if (impersonatedUserDetails) {
      effectiveUser = impersonatedUserDetails;
      isImpersonating = true;
      originalUsername = session.originalUser.username;
    } else {
      // Failed to load impersonated user, clear impersonation (security measure)
      console.warn(`[API /auth/user] Failed to load impersonated user ID: ${session.impersonatingUserId}. Clearing impersonation.`);
      session.impersonatingUserId = undefined;
      session.originalUser = undefined; 
      await session.save();
      // Fall through to load original user
      effectiveUser = await loadUserById(session.user.id);
    }
  } else {
    effectiveUser = await loadUserById(session.user.id);
  }
  
  // If effectiveUser is still null (e.g. main user data file deleted after login),
  // but session.user exists and is owner, provide basic owner details from .env.
  if (!effectiveUser && session.user.id === 'owner_root' && process.env.OWNER_USERNAME) {
     effectiveUser = {
        id: 'owner_root',
        username: process.env.OWNER_USERNAME,
        role: 'Owner',
        hashedPassword: '', salt: '', // Not for client
        projects: [], assignedPages: [], allowedSettingsPages: [], status: 'Active',
        createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    } as FullUserData;
  }


  return NextResponse.json(
    {
      user: effectiveUser, // This now includes projects, assignedPages, etc.
      isLoggedIn: true,
      isImpersonating: isImpersonating,
      originalUsername: originalUsername,
    },
    { status: 200 }
  );
}
