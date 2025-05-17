
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  FileText,
  Network,
  Users,
  Settings,
  UserCircle,
  LogOut,
  Replace,
  AlertTriangle,
  EyeOff,
  Loader2, 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { logout as serverLogoutAction } from '@/app/(app)/logout/actions';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { type AuthenticatedUser, type LocalSessionInfo } from '@/lib/session';
import AccessDeniedOverlay from './access-denied-overlay';
import { useToast } from '@/hooks/use-toast';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; 

const navItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, requiredPage: 'dashboard' },
  { href: '/projects', label: 'Projects', icon: Layers, count: 0, requiredPage: 'projects_page' },
  { href: '/files', label: 'File Manager', icon: FileText, requiredPage: 'files' },
  { href: '/ports', label: 'Port Manager', icon: Network, requiredPage: 'ports' },
  { href: '/roles', label: 'User Roles', icon: Users, requiredPage: 'roles' },
  { href: '/settings', label: 'Settings', icon: Settings, requiredPage: 'settings_area' },
];

interface ApiAuthUserResponse {
  user: AuthenticatedUser | null;
  error?: string;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  useActivityTracker();
  const pathname = usePathname();
  const { state: sidebarState, isMobile } = useSidebar();
  const router = useRouter();
  const { toast } = useToast();

  const [currentUserData, setCurrentUserData] = useState<AuthenticatedUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isPageAccessGranted, setIsPageAccessGranted] = useState<boolean | null>(null);
  const [debugMode, setDebugMode] = useState(false);

  const performLogout = useCallback(async (reason?: string) => {
    const storedSession = localStorage.getItem('dvpanel-session');
    let usernameToLogout, roleToLogout;
    if (storedSession) {
      try {
        const session: LocalSessionInfo = JSON.parse(storedSession);
        usernameToLogout = session.username;
        roleToLogout = session.role;
      } catch (e) {
        console.error("[AppShell] Error parsing session from localStorage during logout", e);
      }
    }

    localStorage.removeItem('dvpanel-session');
    setCurrentUserData(null);
    setIsPageAccessGranted(false); // Ensure access is revoked on logout

    try {
      await serverLogoutAction(usernameToLogout, roleToLogout);
    } catch (e) {
      console.error("[AppShell] Error calling server logout action:", e);
    }
    if (debugMode) console.log(`[AppShell] performLogout triggered, redirecting to /login. Reason: ${reason}`);
    router.push(`/login${reason ? `?reason=${reason}` : '?reason=logout'}`);
  }, [router, debugMode]);

  useEffect(() => {
    const fetchAppSettings = async () => {
      try {
        const settingsResult = await loadPanelSettings();
        if (settingsResult.data) {
          setDebugMode(settingsResult.data.debugMode ?? false);
        }
      } catch (e) {
        console.error("[AppShell] Failed to load panel settings for debug mode", e);
      }
    };
    fetchAppSettings();
  }, []);

  useEffect(() => {
    const fetchUserAndCheckAccess = async () => {
      setIsLoadingUser(true);
      setIsPageAccessGranted(null); 
      if (debugMode) console.log('[AppShell] fetchUserAndCheckAccess started. Pathname:', pathname);

      const storedSession = localStorage.getItem('dvpanel-session');
      if (debugMode) console.log('[AppShell] Stored session from localStorage:', storedSession ? "Found" : "Not Found");

      if (!storedSession) {
        if (debugMode) console.log('[AppShell] No session in localStorage. Performing logout.');
        setCurrentUserData(null);
        setIsLoadingUser(false);
        performLogout('unauthorized'); 
        return;
      }

      let session: LocalSessionInfo;
      try {
        session = JSON.parse(storedSession);
        if (debugMode) console.log('[AppShell] Parsed session from localStorage:', { username: session.username, role: session.role, tokenExists: !!session.token });
      } catch (e) {
        if (debugMode) console.error('[AppShell] Failed to parse session from localStorage. Performing logout.', e);
        performLogout('unauthorized');
        return;
      }
      
      if (!session.token || !session.username || !session.role) {
        if (debugMode) console.log('[AppShell] Incomplete session data in localStorage. Performing logout.');
        performLogout('unauthorized');
        return;
      }
        
      try {
        if (debugMode) console.log('[AppShell] Fetching /api/auth/user with headers:', { 'X-Auth-Token': session.token, 'X-Auth-Username': session.username, 'X-Auth-Role': session.role });
        const response = await fetch('/api/auth/user', {
          method: 'GET', // Explicitly GET
          headers: {
            'X-Auth-Token': session.token,
            'X-Auth-Username': session.username,
            'X-Auth-Role': session.role,
          }
        });
        
        if (debugMode) console.log('[AppShell] /api/auth/user response status:', response.status);

        if (!response.ok) { 
          const errorData = await response.json().catch(() => ({ error: "Failed to parse error response from /api/auth/user" }));
          if (debugMode) console.warn(`[AppShell] /api/auth/user returned non-OK status: ${response.status}. Error:`, errorData?.error);
          performLogout(response.status === 401 ? 'unauthorized' : 'session_error');
          return;
        }

        const data: ApiAuthUserResponse = await response.json();
        if (debugMode) console.log('[AppShell] Data from /api/auth/user:', data.user ? { username: data.user.username, role: data.user.role } : "No user data in response");

        if (data.user) {
          setCurrentUserData(data.user);
        } else {
          if (debugMode) console.warn('[AppShell] No user object in successful /api/auth/user response body. Performing logout.');
          performLogout('unauthorized');
        }
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        console.error("[AppShell] Error in fetchUserAndCheckAccess during API call:", e.message, e.stack);
        performLogout('session_error');
      } finally {
        setIsLoadingUser(false);
        if (debugMode) console.log('[AppShell] fetchUserAndCheckAccess finished. isLoadingUser:', false);
      }
    };

    fetchUserAndCheckAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, debugMode]); // performLogout is memoized, router is stable

  useEffect(() => {
    if (isLoadingUser || !currentUserData) {
      if (debugMode && !isLoadingUser && !currentUserData) console.log('[AppShell] Page access check: No current user data or still loading, access not granted yet.');
      return;
    }

    const effectiveUser = currentUserData;
    let hasAccess = false;
    let requiredPageId = 'unknown';

    const currentTopLevelPath = pathname.split('/')[1] || '';
    
    if (pathname.startsWith('/settings')) {
        const settingSubPage = pathname.split('/')[2] || 'panel'; 
        requiredPageId = `settings_${settingSubPage === '' ? 'panel' : settingSubPage}`;
    } else {
        const navItemMatch = navItemsBase.find(item =>
            item.href === '/' ? pathname === '/' : (pathname.startsWith(item.href) && item.href !== '/')
        );
        if (navItemMatch) {
            requiredPageId = navItemMatch.requiredPage;
        } else if (pathname === '/') {
             requiredPageId = 'dashboard'; 
        }
    }
    
    if (debugMode) console.log(`[AppShell] Page access check for path: "${pathname}", effectiveUser role: "${effectiveUser.role}", requiredPageId: "${requiredPageId}"`);

    if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
      hasAccess = true;
      if (debugMode) console.log('[AppShell] Page access: Granted (Owner/Administrator)');
    } else if (effectiveUser.role === 'Admin') {
      if (requiredPageId.startsWith('settings_')) {
        hasAccess = effectiveUser.allowedSettingsPages?.includes(requiredPageId) ?? false;
        if (debugMode) console.log(`[AppShell] Page access (Admin, settings): ${hasAccess} for ${requiredPageId}`);
      } else {
        const adminAllowedAppPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles']; 
        hasAccess = adminAllowedAppPages.includes(requiredPageId);
        if (debugMode) console.log(`[AppShell] Page access (Admin, app page): ${hasAccess} for ${requiredPageId}`);
      }
    } else if (effectiveUser.role === 'Custom' && effectiveUser.assignedPages) {
      if (requiredPageId.startsWith('settings_')) {
        hasAccess = (effectiveUser.assignedPages.includes('settings_area') && (effectiveUser.allowedSettingsPages?.includes(requiredPageId) ?? false));
        if (debugMode) console.log(`[AppShell] Page access (Custom, settings): ${hasAccess} for ${requiredPageId}`);
      } else {
        hasAccess = effectiveUser.assignedPages.includes(requiredPageId);
        if (debugMode) console.log(`[AppShell] Page access (Custom, app page): ${hasAccess} for ${requiredPageId}`);
      }
    }
    
    setIsPageAccessGranted(hasAccess);
    if (debugMode) console.log(`[AppShell] Final isPageAccessGranted: ${hasAccess}`);

  }, [isLoadingUser, currentUserData, pathname, debugMode]);


  const effectiveUser = currentUserData;

  const navItems = navItemsBase.filter(item => {
    if (!effectiveUser) return false;
    if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') return true;
    if (effectiveUser.role === 'Admin') {
      if (item.requiredPage === 'settings_area') {
        return effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
      }
      const adminAllowedPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles'];
      return item.requiredPage ? adminAllowedPages.includes(item.requiredPage) : true;
    }
    if (effectiveUser.role === 'Custom' && item.requiredPage) {
      return effectiveUser.assignedPages?.includes(item.requiredPage) ?? false;
    }
    return false;
  });

  const menuButtonRef = React.useRef<HTMLSpanElement>(null);


  let pageContent;
  if (isLoadingUser || isPageAccessGranted === null) {
    pageContent = (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  } else if (currentUserData && isPageAccessGranted) { // Check currentUserData for truthiness before assuming logged in
    pageContent = children;
  } else if (currentUserData && !isPageAccessGranted) { // Logged in but no access
    pageContent = <AccessDeniedOverlay />;
  } else { 
    // This state implies !currentUserData && !isLoadingUser, meaning auth check failed or user is not logged in.
    // performLogout should have already redirected. If we reach here, it's an unexpected state.
    // Show loader as a fallback, but this path should ideally not be hit if performLogout works.
    if (debugMode) console.log('[AppShell] Reached unexpected content rendering state: !currentUserData && !isLoadingUser. Should have been redirected.');
    pageContent = (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Redirecting...</p>
      </div>
    );
  }


  return (
    <>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link href="/" className="flex items-center gap-2">
            <Replace size={28} className="text-primary" />
            <h1 className="text-xl font-semibold text-foreground">DVPanel</h1>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href) && item.href !== '/';

              const menuButton = (
                <SidebarMenuButton
                  // ref is no longer needed here as it's a span and TooltipTrigger wraps Link
                  isActive={isActive}
                  variant="default"
                  size="default"
                >
                  <item.icon />
                  <span className={cn(
                    { "invisible group-data-[[data-state=collapsed]]:visible": sidebarState === 'collapsed' && !isMobile },
                    { "group-data-[[data-state=collapsed]]:hidden": sidebarState === 'collapsed' && !isMobile }
                  )}>
                    {item.label}
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <SidebarMenuBadge className={cn(
                      { "group-data-[[data-state=collapsed]]:hidden": sidebarState === 'collapsed' && !isMobile }
                    )}>
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              );

               let linkElement = (
                 <Link href={item.href} legacyBehavior passHref>
                   {menuButton}
                 </Link>
               );

               if (sidebarState === 'collapsed' && !isMobile && item.label) {
                 return (
                   <SidebarMenuItem key={item.label}>
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           {linkElement}
                         </TooltipTrigger>
                         <TooltipContent side="right" align="center">
                           <p>{item.label}</p>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                   </SidebarMenuItem>
                 );
               }

              return (
                <SidebarMenuItem key={item.label}>
                  {linkElement}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 flex flex-col gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="https://placehold.co/100x100.png" alt="User" data-ai-hint="user avatar"/>
                  <AvatarFallback>{isLoadingUser || !effectiveUser ? 'L' : effectiveUser.username?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                </Avatar>
                <span className={cn(
                  "truncate",
                  { "hidden": sidebarState === 'collapsed' && !isMobile }
                )}>
                  {isLoadingUser || !effectiveUser ? "Loading..." : effectiveUser.username ?? "Not Logged In"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!effectiveUser}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!effectiveUser} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => performLogout()} disabled={isLoadingUser && !effectiveUser}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8"
        )}>
          <SidebarTrigger className="md:hidden" />
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {pageContent}
        </main>
      </SidebarInset>
    </>
  );
}
