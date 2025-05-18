
"use client";

import React, { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuItemLayout, // Use the layout component
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
  LogOut,
  AlertTriangle,
  Loader2,
  PanelLeft,
  Eye,
  Edit,
  ScrollText,
  Crown,
  ShieldCheck,
  UserCog,
  SlidersHorizontal,
  Image as ImageIcon,
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
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { logout as serverLogoutAction } from '@/app/(app)/logout/actions';
import type { AuthenticatedUser } from '@/lib/session';
import AccessDeniedOverlay from './access-denied-overlay';
import { useToast } from "@/hooks/use-toast";
import { cva } from 'class-variance-authority';
import ProfileDialog from '@/app/(app)/profile/components/profile-dialog';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import DebugOverlay from '@/components/debug-overlay';
import LogsViewerDialog from '@/components/logs/LogsViewerDialog';
import Image from 'next/image';


const navItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, requiredPage: 'dashboard' },
  { href: '/projects', label: 'Projects', icon: Layers, count: 0, requiredPage: 'projects_page' },
  { href: '/files', label: 'File Manager', icon: FileText, requiredPage: 'files' },
  { href: '/ports', label: 'Port Manager', icon: Network, requiredPage: 'ports' },
  { href: '/roles', label: 'User Roles', icon: Users, requiredPage: 'roles' },
  { href: '/settings', label: 'Settings', icon: Settings, requiredPage: 'settings_area' },
];

// Define CVA for Link styling here
const linkAsButtonVariants = cva(
  "flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-data-[state=collapsed]:group-data-[collapsible=icon]:justify-center group-data-[state=collapsed]:group-data-[collapsible=icon]:size-8 group-data-[state=collapsed]:group-data-[collapsible=icon]:p-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      },
      size: {
        default: "h-8", // Default height
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
  const pathname = usePathname();
  const { state: sidebarState, isMobile, setOpen: setSidebarOpen } = useSidebar();
  const router = useRouter();
  const { toast } = useToast();

  const [currentUserData, setCurrentUserData] = useState<AuthenticatedUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isPageAccessGranted, setIsPageAccessGranted] = useState<boolean | null>(null);
  const [effectiveDebugMode, setEffectiveDebugMode] = useState(false);
  const [showDebugOverlayToggle, setShowDebugOverlayToggle] = useState(false);
  const [isPendingLogout, startLogoutTransition] = React.useTransition();
  const [hasMounted, setHasMounted] = useState(false);

  const [isDebugOverlayOpen, setIsDebugOverlayOpen] = useState(false);
  const [isLogsViewerOpen, setIsLogsViewerOpen] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const performLogout = useCallback(async () => {
    if (effectiveDebugMode) console.log('[AppShell] performLogout initiated.');
    startLogoutTransition(async () => {
      try {
        await serverLogoutAction();
        // Client-side state updates after server action
        setCurrentUserData(null);
        setIsPageAccessGranted(false);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          router.push('/login?reason=user_initiated');
        }
      } catch (e: any) {
        const isRedirectError = e.message === 'NEXT_REDIRECT' || (typeof e.digest === 'string' && e.digest.startsWith('NEXT_REDIRECT'));
        if (isRedirectError) {
          if (effectiveDebugMode) console.log("[AppShell] Logout action triggered a redirect, which is expected.");
           // NEXT_REDIRECT error means server handled the redirect, common in App Router.
           // Client-side router.push might be redundant or even conflict if server already redirected.
           // We still might want to clear client state.
        } else {
          const error = e instanceof Error ? e.message : String(e);
          console.error("[AppShell] Error calling server logout action:", error, e);
          toast({ title: "Logout Error", description: `Failed to logout: ${error}`, variant: "destructive" });
           // Fallback cleanup and redirect if server action fails to redirect
          setCurrentUserData(null);
          setIsPageAccessGranted(false);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
             router.push('/login?reason=logout_server_error');
          }
        }
      }
    });
  }, [router, toast, effectiveDebugMode]);


  const fetchUserAndCheckAccess = useCallback(async () => {
    if (!hasMounted) {
      if (effectiveDebugMode) console.log('[AppShell] fetchUserAndCheckAccess: Not mounted yet, skipping fetch.');
      return;
    }
    if (effectiveDebugMode) console.log('[AppShell] fetchUserAndCheckAccess: Attempting to fetch /api/auth/user.');
    setIsLoadingUser(true);
    try {
      const response = await fetch('/api/auth/user');
      const responseStatus = response.status;
      if (effectiveDebugMode) console.log('[AppShell] /api/auth/user response status:', responseStatus);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Could not read error response text.");
        if (effectiveDebugMode) console.warn(`[AppShell] /api/auth/user call failed. Status: ${responseStatus}. Response text:`, errorText);
        performLogout(responseStatus === 401 ? 'unauthorized_api' : 'session_error_api');
        return;
      }

      const data = await response.json();
      if (data.user && data.user.status === 'Active') {
        setCurrentUserData(data.user);
        setEffectiveDebugMode(data.user.globalDebugMode ?? false);
        setShowDebugOverlayToggle(data.user.globalDebugMode ?? false);
        if (effectiveDebugMode || data.user.globalDebugMode) {
          console.log('[AppShell] User data fetched successfully:', {
            id: data.user.id, username: data.user.username, role: data.user.role, status: data.user.status,
            userSettingsDebug: data.user.userSettings?.debugMode,
            globalDebugModeApi: data.user.globalDebugMode,
          });
        }
      } else {
        if (effectiveDebugMode) console.warn('[AppShell] No active user data in response from /api/auth/user. User object:', data.user);
        performLogout(data.user?.status === 'Inactive' ? 'account_inactive' : 'unauthorized_no_user_data');
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      if (effectiveDebugMode) console.error("[AppShell] Error in fetchUserAndCheckAccess during API call:", e.message, e.stack);
      toast({ title: "Session Error", description: "Could not verify session. Please log in again.", variant: "destructive" });
      performLogout('session_error_catch');
    } finally {
      setIsLoadingUser(false);
      if (effectiveDebugMode) console.log('[AppShell] fetchUserAndCheckAccess finished. isLoadingUser:', false);
    }
  }, [hasMounted, performLogout, effectiveDebugMode, toast]);


  useEffect(() => {
    if (hasMounted) {
        fetchUserAndCheckAccess();
    }
  }, [pathname, hasMounted, fetchUserAndCheckAccess]);

  const effectiveUser = currentUserData;

  useEffect(() => {
    if (!hasMounted || isLoadingUser || !effectiveUser) {
      if (effectiveDebugMode && !isLoadingUser && !effectiveUser && hasMounted) console.log('[AppShell] Page access check: No current user data or still loading, access not determined yet.');
      setIsPageAccessGranted(null); // Set to null if still loading or no user
      return;
    }
    
    let hasAccess = false;
    const pathSegments = pathname.split('/').filter(Boolean);
    const currentTopLevelPath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';
    
    const currentNavItem = navItemsBase.find(item => {
        if (item.href === '/') return currentTopLevelPath === '/';
        if (item.href === '/settings') return pathname.startsWith('/settings');
        return currentTopLevelPath.startsWith(item.href);
    });
    const requiredPageId = currentNavItem?.requiredPage;
    
    const globalDebugSetting = currentUserData?.globalDebugMode ?? false; 
    if (globalDebugSetting) {
        console.log(`[AppShell] Page access check for path: "${pathname}", topLevelPath: "${currentTopLevelPath}", effectiveUser role: "${effectiveUser.role}", requiredPageId: "${requiredPageId}"`);
    }

    if (effectiveUser.status === 'Inactive') {
      hasAccess = false;
      if (globalDebugSetting) console.log('[AppShell] Page access: Denied (User Inactive)');
    } else if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
      hasAccess = true;
      if (globalDebugSetting) console.log('[AppShell] Page access: Granted (Owner/Administrator)');
    } else if (effectiveUser.role === 'Admin') {
      const adminAllowedMainPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles'];
      if (requiredPageId && requiredPageId === 'settings_area') {
        hasAccess = effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
         if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) {
          const specificSettingPage = `settings_${pathSegments[1]}`;
          hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPage) ?? false;
        }
      } else {
        hasAccess = requiredPageId ? adminAllowedMainPages.includes(requiredPageId) : pathname === '/';
      }
      if (globalDebugSetting) console.log(`[AppShell] Page access (Admin for ${requiredPageId || pathname}): ${hasAccess}`);
    } else if (effectiveUser.role === 'Custom' && effectiveUser.assignedPages) {
      if (requiredPageId && requiredPageId === 'settings_area') {
        hasAccess = effectiveUser.assignedPages.includes('settings_area');
        if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) {
          const specificSettingPage = `settings_${pathSegments[1]}`;
          hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPage) ?? false;
        }
      } else if (requiredPageId) {
        hasAccess = effectiveUser.assignedPages.includes(requiredPageId);
      } else {
         hasAccess = pathname === '/' && effectiveUser.assignedPages.includes('dashboard');
      }
      if (globalDebugSetting) console.log(`[AppShell] Page access (Custom for ${requiredPageId || pathname}): ${hasAccess}`);
    } else {
      hasAccess = false;
      if (globalDebugSetting) console.log('[AppShell] Page access: Denied (Unknown role or no assigned pages)');
    }

    setIsPageAccessGranted(hasAccess);
     if (globalDebugSetting) console.log(`[AppShell] Final isPageAccessGranted set to: ${hasAccess} for path ${pathname}`);

  }, [isLoadingUser, effectiveUser, pathname, hasMounted, currentUserData?.globalDebugMode]);


  const navItems = React.useMemo(() => {
    if (!hasMounted || !effectiveUser || effectiveUser.status === 'Inactive') return [];
    
    return navItemsBase.filter(item => {
      if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') return true;
      if (effectiveUser.role === 'Admin') {
         const adminAllowedPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles'];
         if (item.requiredPage === 'settings_area') {
             return false; 
         }
        return item.requiredPage ? adminAllowedPages.includes(item.requiredPage) : true;
      }
      if (effectiveUser.role === 'Custom' && item.requiredPage) {
        return effectiveUser.assignedPages?.includes(item.requiredPage) ?? false;
      }
      return false;
    });
  }, [effectiveUser, hasMounted]);
  
  const menuButtonRef = useRef<HTMLAnchorElement>(null);

  const handleSettingsUpdated = useCallback(() => {
    if (effectiveDebugMode) console.log("[AppShell] Profile settings updated, refetching user data.");
    fetchUserAndCheckAccess();
  }, [fetchUserAndCheckAccess, effectiveDebugMode]);

  const getIsActive = useCallback((itemHref: string): boolean => {
    if (!hasMounted) return false;
    // For dashboard, exact match. For settings, match prefix. For others, prefix match.
    if (itemHref === '/') return pathname === '/';
    if (itemHref === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/');
    return pathname.startsWith(itemHref);
  }, [pathname, hasMounted]);


  let pageContent;
  if (!hasMounted || isLoadingUser || (effectiveUser && isPageAccessGranted === null)) {
    pageContent = hasMounted ? (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ) : null;
  } else if (effectiveUser && isPageAccessGranted === true) {
    pageContent = children;
  } else if (effectiveUser && isPageAccessGranted === false) {
    pageContent = <AccessDeniedOverlay />;
  } else if (!effectiveUser && !isLoadingUser && hasMounted) {
     pageContent = (
      <div className="flex flex-col justify-center items-center h-64">
        <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
        <p>Session invalid or expired.</p>
        <p className="text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  } else {
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

  if (typeof window !== 'undefined' && (effectiveDebugMode || currentUserData?.globalDebugMode)) {
      console.log('[AppShell RENDER DEBUG]', {
        pathname,
        hasMounted,
        isLoadingUser,
        isEffectiveUserAvailable: !!effectiveUser,
        effectiveUserRole: effectiveUser?.role,
        isPageAccessGranted,
      });
  }


  return (
    <>
      <Sidebar>
        <SidebarHeader className="p-4">
           <Link href="/" className="block group mx-auto">
             <motion.div
                className="w-full max-w-[200px] rounded-lg flex flex-col items-center justify-center cursor-pointer text-center transition-all duration-150 ease-out group-hover:tracking-normal"
                whileHover={{
                  scale: 1.03,
                }}
                transition={{ duration: 0.2, ease: "circOut" }}
              >
                <h2 className="text-sm font-medium text-slate-300 group-hover:text-slate-200 transition-colors duration-200 mb-0.5">
                  Welcome to
                </h2>
                <h1
                  className={cn(
                    "text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary via-sky-400 to-cyan-300 tracking-tight select-none text-center transition-all duration-150 ease-out group-hover:scale-110 group-hover:tracking-normal group-hover:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]"
                  )}
                >
                  DVPanel
                </h1>
              </motion.div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = getIsActive(item.href);
              const showTextForLayout = hasMounted && (!isMobile && sidebarState === 'expanded' || isMobile);
              const showTooltip = hasMounted && sidebarState === 'collapsed' && !isMobile && item.label;

              const menuButtonContent = (
                <SidebarMenuItemLayout
                  icon={item.icon}
                  label={item.label}
                  badgeContent={item.count != null && item.count > 0 ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : undefined}
                  showText={showTextForLayout}
                />
              );

              const linkElement = (
                 <Link
                  href={item.href}
                  asChild // Link will pass props to SidebarMenuItemLayout
                  className={cn(linkAsButtonVariants({ isActive }))} 
                >
                  <SidebarMenuItemLayout
                    icon={item.icon}
                    label={item.label}
                    badgeContent={item.count != null && item.count > 0 ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : undefined}
                    showText={showTextForLayout}
                    isActive={isActive} // Pass isActive for internal styling if SidebarMenuItemLayout handles it
                    // Spread other Link props if SidebarMenuItemLayout is an <a>
                  />
                </Link>
              );
              
              if (showTooltip) {
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
              <DropdownMenuItem onClick={() => setIsLogsViewerOpen(true)}>
                <ScrollText className="mr-2 h-4 w-4" />
                Panel Logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={performLogout} disabled={!hasMounted || isLoadingUser || !effectiveUser || isPendingLogout}>
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
                className="md:hidden" 
              >
              <PanelLeft className="mr-2 h-4 w-4" /> Collapse
            </Button>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8",
            "md:hidden group-data-[variant=inset]/sidebar-wrapper:md:flex group-data-[variant=inset]/sidebar-wrapper:md:items-center"
            )}>
          <SidebarTrigger className="md:hidden" />
           <div className="md:hidden group-data-[variant=inset]/sidebar-wrapper:md:flex group-data-[variant=inset]/sidebar-wrapper:md:items-center">
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {pageContent}
        </main>
      </SidebarInset>
      {showDebugOverlayToggle && DebugOverlay && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 z-[5001] h-10 w-10 rounded-full shadow-lg"
          onClick={() => setIsDebugOverlayOpen(true)}
          aria-label="Open Debug Overlay"
        >
          <AlertTriangle className="h-5 w-5" />
        </Button>
      )}
      {isDebugOverlayOpen && effectiveDebugMode && DebugOverlay && (
        <Suspense fallback={<div className="fixed bottom-4 right-4 p-2 bg-muted rounded-md shadow-lg">Loading Debug...</div>}>
          <DebugOverlay
            currentUserData={currentUserData}
            pathname={pathname}
            sidebarState={sidebarState}
            isMobile={isMobile}
            onClose={() => setIsDebugOverlayOpen(false)}
          />
        </Suspense>
      )}
      {LogsViewerDialog && 
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[5000]"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>}>
          <LogsViewerDialog open={isLogsViewerOpen} onOpenChange={setIsLogsViewerOpen} />
        </Suspense>
      }
    </>
  );
}
    
