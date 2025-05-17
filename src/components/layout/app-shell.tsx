
"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Shield,
  ArrowLeft,
  Eye,
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
import { type AuthenticatedUser } from '@/lib/session';
import AccessDeniedOverlay from './access-denied-overlay';
import { useToast } from '@/hooks/use-toast';
import { loadPanelSettings, type PanelSettingsData } from '@/app/(app)/settings/actions';

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
  const [isPendingLogout, startLogoutTransition] = React.useTransition();
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const performLogout = useCallback(async (reason?: string) => {
    if (debugMode) console.log('[AppShell] performLogout initiated.', { reason });
    startLogoutTransition(async () => {
      try {
        await serverLogoutAction();
        if (debugMode) console.log('[AppShell] Server logout action completed.');
        setCurrentUserData(null);
        setIsPageAccessGranted(false);
        router.push(`/login${reason ? `?reason=${reason}` : ''}`);
      } catch (e) {
        console.error("[AppShell] Error calling server logout action:", e);
        toast({ title: "Logout Error", description: "Failed to logout on server.", variant: "destructive" });
        setCurrentUserData(null);
        setIsPageAccessGranted(false);
        router.push(`/login${reason ? `?reason=${reason}_server_error` : '?reason=server_error'}`);
      }
    });
  }, [router, debugMode, toast]);

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
    if (!hasMounted) return; 

    const fetchUserAndCheckAccess = async () => {
      setIsLoadingUser(true);
      setIsPageAccessGranted(null);
      if (debugMode) console.log('[AppShell] fetchUserAndCheckAccess started. Pathname:', pathname);

      try {
        if (debugMode) console.log('[AppShell] Fetching /api/auth/user');
        const response = await fetch('/api/auth/user');
        if (debugMode) console.log('[AppShell] /api/auth/user response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
          if (debugMode) console.warn(`[AppShell] /api/auth/user NOK. Status: ${response.status}. Error:`, errorData?.error);
          performLogout(pathname === '/login' ? undefined : 'unauthorized');
          return;
        }

        const data: ApiAuthUserResponse = await response.json();
        if (debugMode && data.user) {
            console.log('[AppShell] Data from /api/auth/user:', { id: data.user.id, username: data.user.username, role: data.user.role, status: data.user.status });
        } else if (debugMode) {
            console.log('[AppShell] No user data in response from /api/auth/user or user object is null.');
        }


        if (data.user && data.user.status === 'Active') {
          setCurrentUserData(data.user);
        } else {
          if (debugMode && data.user) console.warn(`[AppShell] User status is not Active: ${data.user.status}. Logging out.`);
          else if (debugMode) console.warn('[AppShell] No user object or inactive user in successful /api/auth/user response. Performing logout.');
          performLogout(data.user?.status === 'Inactive' ? 'account_inactive' : 'unauthorized');
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
  }, [pathname, debugMode, performLogout, hasMounted]);

  useEffect(() => {
    if (!hasMounted || isLoadingUser || !currentUserData) {
      if (debugMode && !isLoadingUser && !currentUserData && hasMounted) console.log('[AppShell] Page access check: No current user data or still loading, access not determined yet.');
      setIsPageAccessGranted(null); // Explicitly set to null until access is determined
      return;
    }

    const effectiveUser = currentUserData;
    let hasAccess = false;
    const pathSegments = pathname.split('/').filter(Boolean);
    const currentTopLevelPath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';
    
    let requiredPageId = navItemsBase.find(item => {
        if (item.href === '/') return currentTopLevelPath === '/';
        // For settings, we check if the path starts with /settings
        if (item.href === '/settings') return currentTopLevelPath.startsWith('/settings');
        return currentTopLevelPath.startsWith(item.href);
      })?.requiredPage;

    if (!requiredPageId && currentTopLevelPath === '/') requiredPageId = 'dashboard';


    if (debugMode) console.log(`[AppShell] Page access check for path: "${pathname}", topLevelPath: "${currentTopLevelPath}", effectiveUser role: "${effectiveUser.role}", requiredPageId: "${requiredPageId}"`);

    if (effectiveUser.status === 'Inactive') {
      hasAccess = false;
      if (debugMode) console.log('[AppShell] Page access: Denied (User Inactive)');
    } else if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
      hasAccess = true;
      if (debugMode) console.log('[AppShell] Page access: Granted (Owner/Administrator)');
    } else if (effectiveUser.role === 'Admin') {
      if (requiredPageId && requiredPageId === 'settings_area') {
        hasAccess = effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
        if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) { // Check specific setting page
          const specificSettingPage = `settings_${pathSegments[1]}`;
          hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPage) ?? false;
        }
      } else if (requiredPageId) {
        const adminAllowedAppPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles']; // Admins should have access to roles
        hasAccess = adminAllowedAppPages.includes(requiredPageId);
      } else {
        hasAccess = false; 
      }
      if (debugMode) console.log(`[AppShell] Page access (Admin for ${requiredPageId || pathname}): ${hasAccess}`);
    } else if (effectiveUser.role === 'Custom' && effectiveUser.assignedPages) {
      if (requiredPageId && requiredPageId === 'settings_area') {
        hasAccess = effectiveUser.assignedPages.includes('settings_area');
        if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) { // Check specific setting page
          const specificSettingPage = `settings_${pathSegments[1]}`;
          hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPage) ?? false;
        }
      } else if (requiredPageId) {
        hasAccess = effectiveUser.assignedPages.includes(requiredPageId);
      } else {
        hasAccess = false; 
      }
      if (debugMode) console.log(`[AppShell] Page access (Custom for ${requiredPageId || pathname}): ${hasAccess}`);
    } else {
      hasAccess = false;
    }

    setIsPageAccessGranted(hasAccess);
    if (debugMode) console.log(`[AppShell] Final isPageAccessGranted: ${hasAccess} for path ${pathname}`);

  }, [isLoadingUser, currentUserData, pathname, debugMode, hasMounted]);


  const effectiveUser = currentUserData;

  const navItems = navItemsBase.filter(item => {
    if (!hasMounted || !effectiveUser || effectiveUser.status === 'Inactive') return false;
    if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') return true;
    if (effectiveUser.role === 'Admin') {
      if (item.requiredPage === 'settings_area') {
        return effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
      }
      // Admins should typically see these pages
      const adminAllowedPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles'];
      return item.requiredPage ? adminAllowedPages.includes(item.requiredPage) : true;
    }
    if (effectiveUser.role === 'Custom' && item.requiredPage) {
      return effectiveUser.assignedPages?.includes(item.requiredPage) ?? false;
    }
    return false;
  });

  let pageContent;
  if (!hasMounted || isLoadingUser || (currentUserData && isPageAccessGranted === null)) {
    pageContent = (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  } else if (effectiveUser && isPageAccessGranted === true) {
    pageContent = children;
  } else if (effectiveUser && isPageAccessGranted === false) {
    pageContent = <AccessDeniedOverlay />;
  } else if (!effectiveUser && !isLoadingUser && hasMounted) {
    // This condition should ideally not be hit often if performLogout redirects quickly
    if (pathname !== '/login') {
      pageContent = (
        <div className="flex justify-center items-center h-64">
          <p>Redirecting to login...</p>
          <Loader2 className="h-8 w-8 animate-spin text-primary ml-2" />
        </div>
      );
    } else {
      pageContent = children; // Allow login page to render if explicitly on /login
    }
  } else {
    // Default loading state if none of the above conditions are met, or before hasMounted
     pageContent = (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading panel...</p>
      </div>
    );
  }

  // Determine active state for sidebar items
  const getIsActive = useCallback((itemHref: string) => {
    if (!hasMounted) return false; // Don't determine active state until mounted
    if (itemHref === '/') {
      return pathname === '/';
    }
    // For settings, active if path starts with /settings
    if (itemHref === '/settings') {
      return pathname.startsWith('/settings');
    }
    return pathname.startsWith(itemHref);
  }, [pathname, hasMounted]);


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
              const menuButton = (
                <SidebarMenuButton
                  isActive={getIsActive(item.href)}
                  variant="default"
                  size="default"
                >
                  {item.icon && <item.icon />}
                  <span className={cn("truncate", { "hidden": sidebarState === 'collapsed' && !isMobile && hasMounted })}>
                    {item.label}
                  </span>
                  {item.count !== undefined && item.count > 0 && hasMounted && (
                    <SidebarMenuBadge className={cn({ "hidden": sidebarState === 'collapsed' && !isMobile })}>
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              );

              let navElement;
              if (sidebarState === 'collapsed' && !isMobile && item.label && hasMounted) {
                navElement = (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href={item.href} asChild>
                          {menuButton}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              } else {
                navElement = (
                  <Link href={item.href} asChild>
                    {menuButton}
                  </Link>
                );
              }
              return <SidebarMenuItem key={item.label}>{navElement}</SidebarMenuItem>;
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 flex flex-col gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="https://placehold.co/100x100.png" alt="User" data-ai-hint="user avatar"/>
                  <AvatarFallback>
                    {(!hasMounted || isLoadingUser || !effectiveUser) ? 'L' : effectiveUser.username?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className={cn("truncate", { "hidden": sidebarState === 'collapsed' && !isMobile && hasMounted })}>
                  {(!hasMounted || isLoadingUser || !effectiveUser) ? "Loading..." : effectiveUser.username ?? "User"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!hasMounted || !effectiveUser || isLoadingUser || isPendingLogout}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!hasMounted || !effectiveUser || isLoadingUser || isPendingLogout} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => performLogout()} disabled={!hasMounted || isLoadingUser || !effectiveUser || isPendingLogout}>
                {isPendingLogout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8")}>
          <SidebarTrigger className="md:hidden" />
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {pageContent}
        </main>
      </SidebarInset>
    </>
  );
}
