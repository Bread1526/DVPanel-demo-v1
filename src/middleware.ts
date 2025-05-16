
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session'; // Changed this line
import { sessionOptions, type SessionData } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getIronSession<SessionData>(request.cookies, sessionOptions);
  const { pathname } = request.nextUrl;

  // Define public paths (accessible without login)
  const publicPaths = ['/login', '/api/auth/user']; // Add any other public API routes if needed

  // If trying to access a public path, allow it
  if (publicPaths.some(path => pathname.startsWith(path)) || pathname.endsWith('.ico') || pathname.endsWith('.png') || pathname.startsWith('/_next/')) {
    // If user is logged in and tries to access /login, redirect to dashboard
    if (session.isLoggedIn && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // If user is not logged in and trying to access a protected path, redirect to login
  if (!session.isLoggedIn) {
    // Preserve the originally requested path in a query parameter for redirection after login
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') { // Don't add redirect for the root path itself if it was the target
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }
  
  // User is logged in and accessing a protected path, allow access
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - files under /public (like images, etc.)
     * Match all paths that don't look like API routes or static assets
     */
    '/((?!api/ping|_next/static|_next/image|favicon.ico|images/).*)',
  ],
};
