'use server';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { ensureOwnerFileExists, loadUserById } from '@/app/(app)/roles/actions'; // For owner file
import { loadPanelSettings } from '@/app/(app)/settings/actions'; // For default inactivity
import { cookies } from 'next/headers';

const publicPaths = ['/login', '/api/auth/user', '/api/ping'];

export async function middleware(request: NextRequest) {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  const { pathname } = request.nextUrl;

  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (debugMode) {
    console.log(`[Middleware] Request for: ${pathname}`);
    console.log(`[Middleware] Initial session.isLoggedIn: ${session.isLoggedIn}`);
    if (session.isLoggedIn) {
      console.log(`[Middleware] Logged in user: ${session.username}, role: ${session.role}, userId: ${session.userId}`);
    }
  }

  // Allow direct access to explicitly public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    if (debugMode) console.log(`[Middleware] Path ${pathname} is public. Allowing.`);
    return NextResponse.next();
  }

  // Handle static files and Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.startsWith('/images/')
  ) {
    if (debugMode) console.log(`[Middleware] Path ${pathname} is a static asset. Allowing.`);
    return NextResponse.next();
  }

  // If user is already logged in
  if (session.isLoggedIn && session.username && session.role && session.userId) {
    if (debugMode) console.log(`[Middleware] User ${session.username} is already logged in.`);
    // Prevent logged-in users from accessing login page
    if (pathname.startsWith('/login')) {
      if (debugMode) console.log(`[Middleware] Logged in user accessing /login. Redirecting to /.`);
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Update lastActivity in session for activity tracking
    // and ensure inactivity settings from their session file are checked by /api/auth/user
    session.lastActivity = Date.now(); // This is for the cookie session part
    await session.save();
    if (debugMode) console.log(`[Middleware] Updated lastActivity for ${session.username} in cookie session.`);
    
    return NextResponse.next();
  }

  // If user is NOT logged in, attempt auto-owner-login for protected routes
  if (debugMode) console.log(`[Middleware] User not logged in. Attempting auto-owner-login for protected path: ${pathname}`);
  const ownerUsernameEnv = process.env.OWNER_USERNAME;
  const ownerPasswordEnv = process.env.OWNER_PASSWORD;

  if (ownerUsernameEnv && ownerPasswordEnv) {
    if (debugMode) console.log(`[Middleware] OWNER_USERNAME and OWNER_PASSWORD are set. Proceeding with Owner session setup.`);
    
    const defaultSettings = panelSettingsResult.data ?? {
      sessionInactivityTimeout: 30,
      disableAutoLogoutOnInactivity: false,
      debugMode: false, // ensure debugMode has a default if panelSettingsResult.data is undefined
    };

    session.isLoggedIn = true;
    session.userId = 'owner_root';
    session.username = ownerUsernameEnv;
    session.role = 'Owner';
    session.lastActivity = Date.now();
    session.sessionInactivityTimeoutMinutes = defaultSettings.sessionInactivityTimeout;
    session.disableAutoLogoutOnInactivity = defaultSettings.disableAutoLogoutOnInactivity;

    try {
      if (debugMode) console.log(`[Middleware] Calling ensureOwnerFileExists for ${ownerUsernameEnv}`);
      // Pass panelSettings to ensureOwnerFileExists so it can use debugMode if needed
      await ensureOwnerFileExists(ownerUsernameEnv, ownerPasswordEnv, panelSettingsResult.data); 
      if (debugMode) console.log(`[Middleware] ensureOwnerFileExists completed for ${ownerUsernameEnv}.`);
    } catch (error) {
      console.error('[Middleware] CRITICAL: Error in ensureOwnerFileExists during auto-owner-login:', error);
      // Decide how to handle this, maybe redirect to an error page or still attempt to save session
    }
    
    await session.save();
    if (debugMode) console.log(`[Middleware] Owner session created/updated and saved. User: ${session.username}`);
    // Important: After setting up the session, we need to let the request proceed to its original destination.
    // The /api/auth/user route will then be called by AppShell to get full user details.
    return NextResponse.next(); 
  } else {
    if (debugMode) console.warn('[Middleware] OWNER_USERNAME or OWNER_PASSWORD not set in .env.local. Cannot auto-login owner.');
    // If not owner credentials in .env, and trying to access a protected path, redirect to login.
    if (debugMode) console.log(`[Middleware] Redirecting unauthenticated user to /login for path: ${pathname}`);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    // Apply middleware to all paths except specific static assets and explicitly public API routes
    '/((?!_next/static|_next/image|static|images|favicon.ico|api/ping).*)',
  ],
};