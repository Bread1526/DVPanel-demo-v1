// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getIronSession<SessionData>(request.cookies, sessionOptions);
  const { pathname } = request.nextUrl;

  // Paths that are public and don't require authentication
  const publicPaths = ['/login', '/api/auth/user']; 

  // Allow Next.js internals, static assets, and specific public API routes
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

  // If trying to access a public path
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // If logged in and trying to access login page, redirect to dashboard
    if (session.isLoggedIn && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // Otherwise, allow access to the public path
    return NextResponse.next();
  }

  // For all other paths, if not logged in, redirect to login
  if (!session.isLoggedIn || !session.user) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If logged in, check for inactivity if auto-logout is enabled for this session
  if (session.user) {
    const currentTime = Date.now();
    const lastActivity = session.lastActivity ?? currentTime; // Default to now if not set

    if (!session.disableAutoLogoutOnInactivity) { // Check if auto-logout is enabled
      const timeoutMinutes = session.sessionInactivityTimeoutMinutes ?? 30; // Default to 30 minutes
      const timeoutMilliseconds = timeoutMinutes * 60 * 1000;

      if (currentTime - lastActivity > timeoutMilliseconds) {
        // User has been inactive for too long
        session.destroy(); // Log out the user
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('reason', 'inactive');
        if (pathname !== '/') {
            loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
        }
        return NextResponse.redirect(loginUrl);
      }
    }
    // If lastActivity was undefined (e.g., for a session created before this feature), update it.
    // Or, if we want to refresh it less frequently than every request for non-activity-tracked requests:
    if (typeof session.lastActivity === 'undefined') {
      session.lastActivity = currentTime;
      // We don't necessarily need to save the session on every request here,
      // as `updateSessionActivity` from client-side interaction handles active refresh.
      // However, saving here ensures `lastActivity` is initialized.
      // To avoid excessive writes, this could be conditional or handled by first activity.
      // For now, let's initialize it if missing.
      await session.save();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply middleware to all paths except Next.js internals, static files, and specific public APIs
    '/((?!_next/static|_next/image|static/|images/|favicon.ico|api/ping).*)',
  ],
};
