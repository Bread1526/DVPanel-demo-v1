
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
    pathname.startsWith('/static/') || // If you have a /public/static folder
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') || // Add other image types if needed
    pathname.startsWith('/images/') || // If you have a /public/images folder
    pathname.startsWith('/api/ping') // Assuming /api/ping is public
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
  if (!session.isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the originally requested path for redirection after login
    // Avoid redirecting to '/' if that was the original path and it's also the dashboard
    if (pathname !== '/') {
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If logged in, initialize lastActivity if it's missing (for older sessions)
  // and then allow access to the protected route.
  if (session.user && typeof session.lastActivity === 'undefined') {
    session.lastActivity = Date.now();
    await session.save(); // This will also refresh the cookie
  }
  
  // Note: The actual enforcement of custom inactivity timeout from settings 
  // is deferred due to complexity of accessing settings from middleware.
  // iron-session's cookie maxAge (if set) or session cookie nature provides session lifetime.
  // The activity tracker refreshes this by re-saving the session.

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply middleware to all paths except Next.js internals, static files, and specific public APIs
    '/((?!_next/static|_next/image|static/|images/|favicon.ico|api/ping).*)',
  ],
};
