
"use client";

import React, { useEffect, useState, useCallback, useTransition } from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuItemLayout,
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
  LogOut,
  Replace,
  AlertTriangle,
  Loader2,
  PanelLeft,
  Crown,
  ShieldCheck,
  UserCog,
  SlidersHorizontal,
  UserCircle, 
  ScrollText, 
  Settings as SettingsIcon, 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import type { AuthenticatedUser } from '@/lib/session';
import AccessDeniedOverlay from './access-denied-overlay';
import { useToast } from "@/hooks/use-toast";
import { cva } from 'class-variance-authority';
import ProfileDialog from '@/app/(app)/profile/components/profile-dialog';
import { loadPanelSettings } from '@/app/(app)/settings/actions'; 

const navItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, requiredPage: 'dashboard' },
  { href: '/projects', label: 'Projects', icon: Layers, count: 0, requiredPage: 'projects_page' }, // Example count
  { href: '/files', label: 'File Manager', icon: FileText, requiredPage: 'files' },
  { href: '/ports', label: 'Port Manager', icon: Network, requiredPage: 'ports' },
  { href: '/roles', label: 'User Roles', icon: Users, requiredPage: 'roles' },
  { href: '/logs', label: 'Panel Logs', icon: ScrollText, requiredPage: 'logs_page' }, // Added Logs Page
  { href: '/settings', label: 'Settings', icon: SettingsIcon, requiredPage: 'settings_area' },
];

interface ApiAuthUserResponse {
  user: AuthenticatedUser | null;
  error?: string;
}

const linkAsButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-data-[state=collapsed]:group-data-[collapsible=icon]:justify-center group-data-[state=collapsed]:group-data-[collapsible=icon]:size-8 group-data-[state=collapsed]:group-data-[collapsible=icon]:p-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      },
      size: {
        default: "h-8",
        sm: "h-7 text-xs",
        lg: "h-12",
      },
      isActive: {
        true: "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary/90",
        false: "text-sidebar-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      isActive: false,
    },
  }
);


export default function AppShell({ children }: { children: React.ReactNode }) {
  useActivityTracker();
  const pathname = usePathname();
  const { state: sidebarState, isMobile, setOpen: setSidebarOpen } = useSidebar();
  const router = useRouter();
  const { toast } = useToast();

  const [currentUserData, setCurrentUserData] = useState<AuthenticatedUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isPageAccessGranted, setIsPageAccessGranted] = useState<boolean | null>(null);
  const [userDebugMode, setUserDebugMode] = useState(false); 
  const [globalDebugMode, setGlobalDebugMode] = useState(false);
  const [isPendingLogout, startLogoutTransition] = useTransition();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const fetchGlobalDebugMode = async () => {
        const settings = await loadPanelSettings();
        if (settings.data?.debugMode) {
            setGlobalDebugMode(true);
        }
    };
    fetchGlobalDebugMode();
  }, []);
  
  const effectiveDebugMode = userDebugMode || globalDebugMode;

  const performLogout = useCallback(async (reason?: string) => {
    if (effectiveDebugMode) console.log('[AppShell] performLogout initiated.', { reason });
    startLogoutTransition(async () => {
      try {
        const usernameToLogout = currentUserData?.username;
        const roleToLogout = currentUserData?.role;
        await serverLogoutAction(usernameToLogout, roleToLogout);
        
        setCurrentUserData(null);
        setIsPageAccessGranted(false); 

        const redirectPath = `/login${reason ? `?reason=${reason}` : ''}`;
        router.push(redirectPath);

      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error("[AppShell] Error calling server logout action:", error);
        toast({ title: "Logout Error", description: `Failed to logout: ${error}`, variant: "destructive" });
        setCurrentUserData(null);
        setIsPageAccessGranted(false);
        router.push(`/login${reason ? `?reason=${reason}_server_error` : '?reason=server_error'}`);
      }
    });
  }, [router, effectiveDebugMode, toast, currentUserData?.username, currentUserData?.role, startLogoutTransition]);

  const fetchUserAndCheckAccess = useCallback(async () => {
    if (!hasMounted) return;

    setIsLoadingUser(true);
    setIsPageAccessGranted(null);
    
    if (effectiveDebugMode) console.log('[AppShell] Attempting to fetch /api/auth/user');

    try {
      const response = await fetch('/api/auth/user');
      const responseStatus = response.status;

      if (effectiveDebugMode) console.log('[AppShell] /api/auth/user response status:', responseStatus);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Could not read error response text.");
        if (effectiveDebugMode) console.warn(`[AppShell] /api/auth/user call failed. Status: ${responseStatus}. Response text:`, errorText);
        if (pathname !== '/login') {
           performLogout(responseStatus === 401 ? 'unauthorized' : 'session_error_api');
        } else {
          setCurrentUserData(null);
        }
        return;
      }

      const data: ApiAuthUserResponse = await response.json();
      if (data.user && data.user.status === 'Active') {
        setCurrentUserData(data.user);
        setUserDebugMode(data.user.userSettings?.debugMode ?? false);
        if (data.user.userSettings?.debugMode || globalDebugMode) {
          console.log('[AppShell] User data fetched successfully:', { 
            id: data.user.id, 
            username: data.user.username, 
            role: data.user.role, 
            status: data.user.status, 
            userSettingsDebug: data.user.userSettings?.debugMode 
          });
        }
      } else {
        if (effectiveDebugMode) console.warn('[AppShell] No active user data in response from /api/auth/user. User object:', data.user);
        if (pathname !== '/login') {
           performLogout(data.user?.status === 'Inactive' ? 'account_inactive' : 'unauthorized_no_user_data');
        } else {
          setCurrentUserData(null);
        }
      }

    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      if (effectiveDebugMode) console.error("[AppShell] Error in fetchUserAndCheckAccess during API call:", e.message, e.stack);
      if (pathname !== '/login') {
        performLogout('session_error_catch');
      } else {
        setCurrentUserData(null);
      }
    } finally {
      setIsLoadingUser(false);
      if (effectiveDebugMode) console.log('[AppShell] fetchUserAndCheckAccess finished. isLoadingUser:', false);
    }
  }, [pathname, performLogout, hasMounted, effectiveDebugMode, globalDebugMode]); 


  useEffect(() => {
    if (hasMounted) {
      fetchUserAndCheckAccess();
    }
  }, [pathname, hasMounted, fetchUserAndCheckAccess]);

  const effectiveUser = currentUserData;

  useEffect(() => {
    if (!hasMounted || isLoadingUser || !effectiveUser) {
      if (userDebugMode && !isLoadingUser && !effectiveUser && hasMounted) console.log('[AppShell] Page access check: No current user data or still loading, access not determined yet.');
      setIsPageAccessGranted(null);
      return;
    }
  
    let hasAccess = false;
    const pathSegments = pathname.split('/').filter(Boolean);
    const currentTopLevelPath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';
    
    let requiredPageId = navItemsBase.find(item => {
      if (item.href === '/') return currentTopLevelPath === '/';
      // Match /settings or /settings/*
      if (item.href === '/settings') return pathname.startsWith('/settings');
      // Match /logs or /logs/*
      if (item.href === '/logs') return pathname.startsWith('/logs');
      return currentTopLevelPath.startsWith(item.href);
    })?.requiredPage;
  
    // Default to dashboard if at root
    if (!requiredPageId && currentTopLevelPath === '/') requiredPageId = 'dashboard';
  
    if (effectiveDebugMode) console.log(`[AppShell] Page access check for path: "${pathname}", topLevelPath: "${currentTopLevelPath}", effectiveUser role: "${effectiveUser.role}", requiredPageId: "${requiredPageId}"`);
  
    if (effectiveUser.status === 'Inactive') {
      hasAccess = false;
      if (effectiveDebugMode) console.log('[AppShell] Page access: Denied (User Inactive)');
    } else if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
      hasAccess = !!navItemsBase.find(item => item.requiredPage === requiredPageId) || (requiredPageId === 'settings_area' && pathname.startsWith('/settings')) || (requiredPageId === 'logs_page' && pathname.startsWith('/logs'));
      if (effectiveDebugMode) console.log(`[AppShell] Page access (Owner/Administrator for ${requiredPageId || pathname}): ${hasAccess}`);
    } else if (effectiveUser.role === 'Admin') {
        // Admins can access dashboard, projects, files, ports, roles, and logs.
        // For settings, they need specific permissions.
        const adminBaseAllowedPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles', 'logs_page'];
        if (requiredPageId === 'settings_area' && pathname.startsWith('/settings')) {
            hasAccess = effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
            if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) {
                const specificSettingPageId = `settings_${pathSegments[1]}`;
                hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPageId) ?? false;
            }
        } else if (requiredPageId) {
            hasAccess = adminBaseAllowedPages.includes(requiredPageId);
        } else {
            hasAccess = false;
        }
        if (effectiveDebugMode) console.log(`[AppShell] Page access (Admin for ${requiredPageId || pathname}): ${hasAccess}`);
    } else if (effectiveUser.role === 'Custom' && effectiveUser.assignedPages) {
      if (requiredPageId === 'settings_area' && pathname.startsWith('/settings')) {
        hasAccess = effectiveUser.assignedPages.includes('settings_area'); 
        if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) { 
          const specificSettingPageId = `settings_${pathSegments[1]}`;
          hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPageId) ?? false;
        }
      } else if (requiredPageId && requiredPageId === 'logs_page' && pathname.startsWith('/logs')) {
        hasAccess = effectiveUser.assignedPages.includes('logs_page');
      }
      else if (requiredPageId) { 
        hasAccess = effectiveUser.assignedPages.includes(requiredPageId);
      } else {
         hasAccess = false;
      }
      if (effectiveDebugMode) console.log(`[AppShell] Page access (Custom for ${requiredPageId || pathname}): ${hasAccess}`);
    } else {
      hasAccess = false;
    }
    
    setIsPageAccessGranted(hasAccess);
    if (effectiveDebugMode) console.log(`[AppShell] Final isPageAccessGranted: ${hasAccess} for path ${pathname}`);
  
  }, [isLoadingUser, effectiveUser, pathname, effectiveDebugMode, hasMounted]);

  const getIsActive = useCallback((itemHref: string) => {
    if (!hasMounted) return false;
    if (itemHref === '/') return pathname === '/';
    // For /settings, make active if path is /settings or /settings/*
    if (itemHref === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/');
    if (itemHref === '/logs') return pathname === '/logs' || pathname.startsWith('/logs/');
    return pathname.startsWith(itemHref);
  }, [pathname, hasMounted]);

  const navItems = navItemsBase.filter(item => {
    if (!hasMounted || !effectiveUser || effectiveUser.status === 'Inactive') return false;

    if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') return true;
    
    if (effectiveUser.role === 'Admin') {
      const adminBaseAllowedPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles', 'logs_page'];
      if (item.requiredPage === 'settings_area') {
        return effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
      }
      return item.requiredPage ? adminBaseAllowedPages.includes(item.requiredPage) : false;
    }
    
    if (effectiveUser.role === 'Custom' && item.requiredPage) {
      return effectiveUser.assignedPages?.includes(item.requiredPage) ?? false;
    }
    return false;
  });

  let pageContent;
  if (!hasMounted || isLoadingUser || (effectiveUser && isPageAccessGranted === null)) {
    pageContent = hasMounted ? (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ) : null; 
  } else if (effectiveUser && isPageAccessGranted === true) {
    pageContent = children;
  } else if (effectiveUser && isPageAccessGranted === false && pathname !== '/login') {
    pageContent = <AccessDeniedOverlay />;
  } else if (!effectiveUser && !isLoadingUser && hasMounted && pathname !== '/login') {
     pageContent = (
      <div className="flex flex-col justify-center items-center h-64">
        <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
        <p>Session invalid or expired.</p>
        <p className="text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  } else if (pathname === '/login' && !isLoadingUser && !effectiveUser) {
    // This case might not be hit if middleware redirects before AppShell mounts for /login
    pageContent = children; 
  }
  else {
     pageContent = hasMounted ? (
      <div className="flex flex-col justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 mt-2">Loading panel data...</p>
      </div>
    ) : null;
  }

  const UserRoleIcon = React.memo(() => {
    if (!hasMounted || isLoadingUser || !effectiveUser) return null;
    switch (effectiveUser.role) {
      case 'Owner': return <Crown className="mr-1.5 h-4 w-4 text-yellow-400" />;
      case 'Administrator': return <ShieldCheck className="mr-1.5 h-4 w-4 text-primary" />;
      case 'Admin': return <UserCog className="mr-1.5 h-4 w-4 text-sky-500" />;
      case 'Custom': return <SlidersHorizontal className="mr-1.5 h-4 w-4 text-purple-500" />;
      default: return null;
    }
  });
  UserRoleIcon.displayName = 'UserRoleIcon';
  
  const handleSettingsUpdated = useCallback(() => {
    if (effectiveDebugMode) console.log("[AppShell] Profile settings updated, refetching user data.");
    fetchUserAndCheckAccess();
  }, [fetchUserAndCheckAccess, effectiveDebugMode]);

  // const menuButtonRef = React.useRef<HTMLAnchorElement>(null);
  // Use different ref for button if SidebarMenuButton renders a button
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);


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
              const isActive = getIsActive(item.href);
              const showTextForLayout = hasMounted && (!isMobile && sidebarState === 'expanded' || isMobile);
              const showTooltip = hasMounted && sidebarState === 'collapsed' && !isMobile && item.label;

              const menuItemContent = (
                <SidebarMenuItemLayout
                  icon={item.icon}
                  label={item.label}
                  badgeContent={item.count && item.count > 0 ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : undefined}
                  showText={showTextForLayout}
                />
              );

              let linkWrappedButton = (
                 <Link href={item.href} className={cn(linkAsButtonVariants({ isActive }))} >
                   {menuItemContent}
                 </Link>
               );

              if (showTooltip) {
                linkWrappedButton = (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {linkWrappedButton}
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              return (
                <SidebarMenuItem key={item.label}>
                  {linkWrappedButton}
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
                  <AvatarFallback>
                    {(!hasMounted || isLoadingUser || !effectiveUser) ? 'L' : effectiveUser.username?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                {(hasMounted && (!isMobile && sidebarState === 'expanded' || isMobile)) && (
                 <div className="flex items-center truncate">
                    <UserRoleIcon />
                    <span className="truncate">
                      {(!hasMounted || isLoadingUser || !effectiveUser) ? "Loading..." : effectiveUser.username ?? "User"}
                    </span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ProfileDialog && <ProfileDialog currentUser={currentUserData} onSettingsUpdate={handleSettingsUpdated} />}
              <DropdownMenuItem onClick={() => router.push('/logs')}>
                <ScrollText className="mr-2 h-4 w-4" />
                <span>Panel Logs</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => performLogout('user_initiated')} disabled={!hasMounted || isLoadingUser || !effectiveUser || isPendingLogout}>
                {isPendingLogout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(hasMounted && (!isMobile && sidebarState === 'expanded' || isMobile)) && (
             <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSidebarOpen(sidebarState === 'expanded' ? false : true)} 
                className="md:hidden" // Only show on mobile if sidebar is expanded, to allow collapsing it
              >
              <PanelLeft className="mr-2 h-4 w-4" /> Collapse
            </Button>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8",
            // This ensures the header is shown when sidebar is inset and not on mobile
            "md:hidden group-data-[variant=inset]/sidebar-wrapper:md:flex group-data-[variant=inset]/sidebar-wrapper:md:items-center" 
            )}>
          <SidebarTrigger className="md:hidden" /> 
           <div className="md:hidden group-data-[variant=inset]/sidebar-wrapper:md:flex group-data-[variant=inset]/sidebar-wrapper:md:items-center">
            {/* Placeholder for potential breadcrumbs or page title in header */}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {pageContent}
        </main>
      </SidebarInset>
    </>
  );
}
