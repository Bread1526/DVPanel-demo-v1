// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const session = await getIronSession<SessionData>(request.cookies, sessionOptions);
  const { pathname } = request.nextUrl;

  const publicPaths = ['/login', '/api/auth/user']; 

  if (pathname.startsWith('/_next/') || 
      pathname.endsWith('.ico') || 
      pathname.endsWith('.png') || 
      pathname.startsWith('/images/') || 
      pathname.startsWith('/api/ping')) {
    return NextResponse.next();
  }

  if (publicPaths.some(path => pathname.startsWith(path))) {
    if (session.isLoggedIn && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!session.isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the originally requested path for redirection after login
    if (pathname !== '/') { // Avoid setting redirect to '/' if that was the original path
        loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|api/ping).*)',
  ],
};
