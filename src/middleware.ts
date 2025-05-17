
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// With localStorage tokens, middleware has limited ability to protect server-rendered pages
// without the token being sent with navigation requests (not standard for typical browsing).
// The primary auth check for pages will now happen client-side in AppShell.
// API routes should independently validate tokens.

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow direct access to static files, Next.js internals, and images
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/api/ping') // Public API for latency check
  ) {
    return NextResponse.next();
  }

  // Allow direct access to /login and /api/auth/user
  // /api/auth/user will perform its own token validation.
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth/user')) {
    return NextResponse.next();
  }

  // For all other routes, we assume they are part of the main application.
  // If a client-side mechanism (e.g., a cookie set by client after successful login)
  // indicated an active session, we could potentially redirect from /login.
  // However, without a server-readable session token (like an HttpOnly cookie),
  // the middleware cannot reliably know if the user is logged in.
  // The client-side AppShell will handle redirecting to /login if localStorage token is missing/invalid.

  // This middleware becomes simpler: it mainly ensures requests are passed through.
  // The client (AppShell) will manage redirects to /login for protected content based on localStorage token status.
  // console.log(`[Middleware] Passing through request for: ${pathname}`);
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all request paths except for the ones starting with:
    // - api (except /api/auth/user which needs to be reachable for initial auth check)
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - static (custom static folder if any)
    // - images (custom images folder if any)
    // - favicon.ico
    // '/((?!_next/static|_next/image|static|images|favicon.ico|api/ping).*)',
    // Simpler matcher: Let client-side routing in AppShell handle unauth access to protected pages
    '/((?!api/auth/user|_next/static|_next/image|favicon.ico|images/|static/).*)',
  ],
};
