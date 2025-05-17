
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getIronSession<SessionData>(request.cookies, sessionOptions);
  const { pathname } = request.nextUrl;

  const publicPaths = ['/login', '/api/auth/user'];

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/api/ping')
  ) {
    return NextResponse.next();
  }

  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  if (isPublicPath) {
    if (session.isLoggedIn && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!session.isLoggedIn || !session.user) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    loginUrl.searchParams.set('reason', 'unauthorized'); // Add reason
    return NextResponse.redirect(loginUrl);
  }

  if (session.user) {
    const currentTime = Date.now();
    const lastActivity = session.lastActivity ?? currentTime; 

    if (!session.disableAutoLogoutOnInactivity) { 
      const timeoutMinutes = session.sessionInactivityTimeoutMinutes ?? 30; 
      const timeoutMilliseconds = timeoutMinutes * 60 * 1000;

      if (currentTime - lastActivity > timeoutMilliseconds) {
        session.destroy(); 
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('reason', 'inactive');
        if (pathname !== '/') {
            loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
        }
        return NextResponse.redirect(loginUrl);
      }
    }
    if (typeof session.lastActivity === 'undefined') {
      session.lastActivity = currentTime;
      await session.save();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|static/|images/|favicon.ico|api/ping).*)',
  ],
};
