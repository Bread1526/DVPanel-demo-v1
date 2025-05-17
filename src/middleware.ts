
'use server';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { ensureOwnerFileExists } from '@/app/(app)/roles/actions'; 
import { loadPanelSettings } from '@/app/(app)/settings/actions'; 
import { cookies } from 'next/headers';

const publicPaths = ['/login', '/api/auth/user', '/api/ping']; // '/api/ping' is an example, adjust if needed

export async function middleware(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  // Note: debugMode here is global. User-specific debugMode is handled client-side or in API routes post-auth.
  const globalDebugMode = panelSettingsResult.data?.debugMode ?? false;
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  const { pathname } = request.nextUrl;

  if (globalDebugMode) {
    console.log(`[Middleware] Request for: ${pathname}. Current session isLoggedIn: ${session.isLoggedIn}`);
  }

  // Allow direct access to explicitly public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    if (globalDebugMode) console.log(`[Middleware] Path ${pathname} is public. Allowing.`);
    // If user is already logged in and tries to access login, redirect to dashboard
    if (session.isLoggedIn && pathname.startsWith('/login')) {
      if (globalDebugMode) console.log(`[Middleware] Logged in user accessing /login. Redirecting to /.`);
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Handle static files and Next.js internals - these should bypass session checks
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') || pathname.endsWith('.svg') || // Added svg
    pathname.startsWith('/images/') // For /public/images
  ) {
    if (globalDebugMode) console.log(`[Middleware] Path ${pathname} is a static asset or internal. Allowing.`);
    return NextResponse.next();
  }

  // If user is already logged in (valid iron-session cookie)
  if (session.isLoggedIn && session.username && session.role && session.userId) {
    if (globalDebugMode) console.log(`[Middleware] User ${session.username} has an active iron-session cookie. Refreshing lastActivity.`);
    session.lastActivity = Date.now(); // Update last activity for the cookie session
    await session.save(); // Refresh cookie expiry
    return NextResponse.next(); // Allow access to the requested protected page
  }

  // User is NOT logged in via iron-session cookie. Attempt auto-owner-login or redirect.
  if (globalDebugMode) console.log(`[Middleware] No active iron-session cookie. Attempting auto-owner-login for protected path: ${pathname}`);
  
  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if (ownerUsernameEnv && ownerPasswordEnv) {
    if (globalDebugMode) console.log(`[Middleware] OWNER_USERNAME and OWNER_PASSWORD are set. Proceeding with Owner session setup.`);
    
    try {
      if (globalDebugMode) console.log(`[Middleware] Calling ensureOwnerFileExists for ${ownerUsernameEnv}`);
      // This function ensures the owner's user file (`{OWNER_USERNAME}-Owner.json`) exists with a hashed password.
      await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelSettingsResult.data); 
      if (globalDebugMode) console.log(`[Middleware] ensureOwnerFileExists completed for ${ownerUsernameEnv}.`);

      // Create the iron-session for the Owner
      session.isLoggedIn = true;
      session.userId = 'owner_root';
      session.username = ownerUsernameEnv;
      session.role = 'Owner';
      session.lastActivity = Date.now();
      session.sessionInactivityTimeoutMinutes = panelSettingsResult.data?.sessionInactivityTimeout ?? 30;
      session.disableAutoLogoutOnInactivity = panelSettingsResult.data?.disableAutoLogoutOnInactivity ?? false;
      
      await session.save();
      if (globalDebugMode) console.log(`[Middleware] Owner session created/updated and iron-session cookie saved for ${session.username}. Allowing request.`);
      // After setting up the session, we need to let the request proceed to its original destination.
      // AppShell will then call /api/auth/user which will validate this newly created session.
      return NextResponse.next(); 

    } catch (error: any) {
      console.error('[Middleware] CRITICAL: Error during ensureOwnerFileExists or session save for auto-owner-login:', error.message, error.stack);
      // If owner setup fails, redirect to login to prevent access.
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'owner_setup_failed');
      if (pathname !== '/login') loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }

  } else {
    if (globalDebugMode) console.warn('[Middleware] OWNER_USERNAME or OWNER_PASSWORD not set in .env.local. Cannot auto-login owner. Redirecting to /login.');
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/login') loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    // Apply middleware to all paths except specific static assets and explicitly public API routes
    '/((?!_next/static|_next/image|favicon.ico|api/ping).*)',
  ],
};
