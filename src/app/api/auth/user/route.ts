
// src/app/api/auth/user/route.ts
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function GET() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ user: null, isLoggedIn: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      user: session.user,
      isLoggedIn: true,
    },
    { status: 200 }
  );
}
