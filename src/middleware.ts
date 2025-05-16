// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getIronSession<SessionData>(request.cookies, sessionOptions);
  const { pathname } = request.nextUrl;

  // Define public paths (accessible without login)
  // /api/auth/user is used by AppShell to check login status for UI rendering.
  const publicPaths = ['/login', '/api/auth/user']; 

  // Allow access to static assets, Next.js internals, and specific public API routes
  if (pathname.startsWith('/_next/') || 
      pathname.endsWith('.ico') || 
      pathname.endsWith('.png') || // General image extension
      pathname.startsWith('/images/') || // If you have a public/images folder
      pathname.startsWith('/api/ping')) { // Example public API
    return NextResponse.next();
  }

  // If trying to access an explicitly defined public path
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // If user is logged in and tries to access /login, redirect to dashboard
    if (session.isLoggedIn && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // For all other paths, if user is not logged in, redirect to login
  if (!session.isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the originally requested path for redirection after login,
    // unless it was the root path itself.
    if (pathname !== '/') {
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }
  
  // User is logged in and accessing a protected path, allow access
  return NextResponse.next();
}

// Updated matcher to be more explicit about what to exclude.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - /images/ (public images) - adjust if your public image folder is different
     * - /api/ping (example public API)
     * Also, explicitly exclude /api/auth/user and /login from being unnecessarily processed by the main protection logic,
     * as they have their own handling within the middleware.
     * The goal is to protect application pages and sensitive APIs.
     */
    '/((?!_next/static|_next/image|favicon.ico|images/|api/ping|api/auth/user|login).*)',
  ],
};
