
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
  SidebarMenuItemLayout, // Keep this if used by SidebarMenuButton/custom layout
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
  Loader2,
  PanelLeft,
  Crown, 
  ShieldCheck, 
  UserCog, 
  SlidersHorizontal,
  Info as InfoIconLucide // Renamed to avoid conflict with Settings Info tab
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
import { cn, } from '@/lib/utils';
import { logout as serverLogoutAction } from '@/app/(app)/logout/actions';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import type { AuthenticatedUser } from '@/lib/session';
import AccessDeniedOverlay from './access-denied-overlay';
import { useToast } from "@/hooks/use-toast";
// import { loadPanelSettings } from '@/app/(app)/settings/actions'; // Global settings not used for debug mode here
import { cva } from 'class-variance-authority';
import ProfileDialog from '@/app/(app)/profile/components/profile-dialog'; // Import ProfileDialog


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
  const { state: sidebarState, isMobile } = useSidebar();
  const router = useRouter();
  const { toast } = useToast();

  const [currentUserData, setCurrentUserData] = useState<AuthenticatedUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isPageAccessGranted, setIsPageAccessGranted] = useState<boolean | null>(null);
  const [userDebugMode, setUserDebugMode] = useState(false); // User-specific debug mode
  const [isPendingLogout, startLogoutTransition] = useTransition();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const performLogout = useCallback(async (reason?: string) => {
    if (userDebugMode) console.log('[AppShell] performLogout initiated.', { reason });
    startLogoutTransition(async () => {
      try {
        const usernameToLogout = currentUserData?.username; 
        const roleToLogout = currentUserData?.role;
        
        if (userDebugMode) console.log(`[AppShell] Calling serverLogoutAction for user: ${usernameToLogout}, role: ${roleToLogout}`);
        await serverLogoutAction(usernameToLogout, roleToLogout); 
        if (userDebugMode) console.log('[AppShell] Server logout action completed.');
        
        setCurrentUserData(null);
        setIsPageAccessGranted(false); 

        const redirectPath = `/login${reason ? `?reason=${reason}` : ''}`;
        if (userDebugMode) console.log(`[AppShell] Redirecting to: ${redirectPath}`);
        router.push(redirectPath);

      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error("[AppShell] Error calling server logout action:", error);
        toast({ title: "Logout Error", description: `Failed to logout on server: ${error}`, variant: "destructive" });
        setCurrentUserData(null);
        setIsPageAccessGranted(false);
        router.push(`/login${reason ? `?reason=${reason}_server_error` : '?reason=server_error'}`);
      }
    });
  }, [router, userDebugMode, toast, currentUserData?.username, currentUserData?.role]);


  const fetchUserAndCheckAccess = useCallback(async () => {
    if(!hasMounted) return; // Don't run on server or before mount

    setIsLoadingUser(true);
    setIsPageAccessGranted(null); 
    
    try {
      if (userDebugMode) console.log('[AppShell] Fetching /api/auth/user');
      const response = await fetch('/api/auth/user');
      const responseStatus = response.status; // Capture status before parsing JSON

      if (userDebugMode) console.log('[AppShell] /api/auth/user response status:', responseStatus);

      if (!response.ok) {
        const errorText = await response.text();
        if (userDebugMode) console.warn(`[AppShell] /api/auth/user NOK. Status: ${responseStatus}. Response text:`, errorText);
        if (pathname !== '/login') {
           performLogout(responseStatus === 401 ? 'unauthorized' : 'session_error_api');
        } else {
          setCurrentUserData(null);
        }
        return;
      }

      const data: ApiAuthUserResponse = await response.json();
      if (userDebugMode && data.user) {
        console.log('[AppShell] Data from /api/auth/user:', { id: data.user.id, username: data.user.username, role: data.user.role, status: data.user.status, userSettings: data.user.userSettings });
      } else if (userDebugMode) {
         console.log('[AppShell] No user data in response from /api/auth/user or user object is null.');
      }
      
      if (data.user && data.user.status === 'Active') {
        setCurrentUserData(data.user);
        setUserDebugMode(data.user.userSettings?.debugMode ?? false); // Set user-specific debug mode
      } else {
        if (userDebugMode && data.user) console.warn(`[AppShell] User status is not Active: ${data.user.status}. Logging out.`);
        else if (userDebugMode) console.warn('[AppShell] No user object or inactive user in successful /api/auth/user response. Performing logout.');
        
        if (pathname !== '/login') {
           performLogout(data.user?.status === 'Inactive' ? 'account_inactive' : 'unauthorized_no_user_data');
        } else {
          setCurrentUserData(null);
        }
      }

    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error("[AppShell] Error in fetchUserAndCheckAccess during API call:", e.message, e.stack);
      if (pathname !== '/login') {
        performLogout('session_error_catch');
      } else {
        setCurrentUserData(null);
      }
    } finally {
      setIsLoadingUser(false);
       if (userDebugMode) console.log('[AppShell] fetchUserAndCheckAccess finished. isLoadingUser:', false);
    }
  }, [pathname, userDebugMode, performLogout, hasMounted, toast]); // Added toast to deps


  useEffect(() => {
    if (hasMounted) {
      fetchUserAndCheckAccess();
    }
  }, [pathname, hasMounted, fetchUserAndCheckAccess]); // fetchUserAndCheckAccess is now stable due to useCallback

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
      if (item.href === '/settings') return pathname.startsWith('/settings'); 
      return currentTopLevelPath.startsWith(item.href);
    })?.requiredPage;
  
    if (!requiredPageId && currentTopLevelPath === '/') requiredPageId = 'dashboard';
  
    if (userDebugMode) console.log(`[AppShell] Page access check for path: "${pathname}", topLevelPath: "${currentTopLevelPath}", effectiveUser role: "${effectiveUser.role}", requiredPageId: "${requiredPageId}"`);
  
    if (effectiveUser.status === 'Inactive') {
      hasAccess = false;
      if (userDebugMode) console.log('[AppShell] Page access: Denied (User Inactive)');
    } else if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
      hasAccess = true;
      if (userDebugMode) console.log('[AppShell] Page access: Granted (Owner/Administrator)');
    } else if (effectiveUser.role === 'Admin') {
      if (requiredPageId && requiredPageId === 'settings_area') {
         hasAccess = effectiveUser.allowedSettingsPages && effectiveUser.allowedSettingsPages.length > 0;
        if (hasAccess && pathSegments[0] === 'settings' && pathSegments[1]) { 
          const specificSettingPage = `settings_${pathSegments[1]}`;
          hasAccess = effectiveUser.allowedSettingsPages?.includes(specificSettingPage) ?? false;
        }
      } else if (requiredPageId) { 
        const adminAllowedAppPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles']; 
        hasAccess = adminAllowedAppPages.includes(requiredPageId);
      } else {
        hasAccess = false; 
      }
      if (userDebugMode) console.log(`[AppShell] Page access (Admin for ${requiredPageId || pathname}): ${hasAccess}`);
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
         hasAccess = false;
      }
      if (userDebugMode) console.log(`[AppShell] Page access (Custom for ${requiredPageId || pathname}): ${hasAccess}`);
    } else {
      hasAccess = false;
    }
    
    setIsPageAccessGranted(hasAccess);
    if (userDebugMode) console.log(`[AppShell] Final isPageAccessGranted: ${hasAccess} for path ${pathname}`);
  
  }, [isLoadingUser, effectiveUser, pathname, userDebugMode, hasMounted]);


  const getIsActive = useCallback((itemHref: string) => {
    if (!hasMounted) return false;
    if (itemHref === '/') return pathname === '/';
    if (itemHref === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/');
    return pathname.startsWith(itemHref);
  }, [pathname, hasMounted]);

  const navItems = navItemsBase.filter(item => {
    if (!hasMounted || !effectiveUser || effectiveUser.status === 'Inactive') return false;
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

  if (userDebugMode && hasMounted && !isLoadingUser) {
    console.log("[AppShell] Effective User for navItems filter:", effectiveUser ? {role: effectiveUser.role, assignedPages: effectiveUser.assignedPages, allowedSettingsPages: effectiveUser.allowedSettingsPages} : null);
    console.log("[AppShell] Filtered navItems count:", navItems.length, navItems.map(i => i.label));
  }

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
      <div className="flex justify-center items-center h-64">
        <AlertTriangle className="h-8 w-8 text-destructive mr-2" />
        <p>Session invalid or expired. Redirecting to login...</p>
      </div>
    );
  } else if (pathname === '/login' && !isLoadingUser && !effectiveUser) {
    pageContent = children;
  }
  else {
     pageContent = hasMounted ? (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading panel...</p>
      </div>
    ) : null;
  }

  const UserRoleIcon = () => {
    if (!hasMounted || isLoadingUser || !effectiveUser) return null;
    switch (effectiveUser.role) {
      case 'Owner': return <Crown className="mr-1.5 h-4 w-4 text-yellow-400" />;
      case 'Administrator': return <ShieldCheck className="mr-1.5 h-4 w-4 text-primary" />;
      case 'Admin': return <UserCog className="mr-1.5 h-4 w-4 text-sky-500" />;
      case 'Custom': return <SlidersHorizontal className="mr-1.5 h-4 w-4 text-purple-500" />;
      default: return null;
    }
  };
  
  const handleSettingsUpdated = useCallback(() => {
    if (userDebugMode) console.log("[AppShell] Profile settings updated, refetching user data.");
    fetchUserAndCheckAccess(); // Refetch user data which includes updated userSettings
  }, [fetchUserAndCheckAccess, userDebugMode]);


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
              const showTooltip = hasMounted && sidebarState === 'collapsed' && !isMobile;

              const menuItemContent = (
                 <SidebarMenuItemLayout
                    icon={item.icon}
                    label={item.label}
                    badgeContent={item.count && item.count > 0 ? <SidebarMenuBadge>{item.count}</SidebarMenuBadge> : undefined}
                    showText={showTextForLayout}
                  />
              );

              const linkElement = (
                <Link
                  href={item.href}
                  className={cn(linkAsButtonVariants({ isActive, variant: "default", size: "default" }))}
                  data-active={isActive ? 'true' : undefined}
                >
                  {menuItemContent}
                </Link>
              );

              return (
                <SidebarMenuItem key={item.label}>
                  {showTooltip ? (
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
                  ) : (
                    linkElement
                  )}
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
                  <AvatarImage src="https://cdn.dvpanel.com/role.png" alt={(!hasMounted || isLoadingUser || !effectiveUser) ? 'L' : effectiveUser.username?.[0]?.toUpperCase() ?? 'U'} data-ai-hint="user avatar"/>
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
              <DropdownMenuItem disabled={!hasMounted || isLoadingUser || !effectiveUser || isPendingLogout} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Panel Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => performLogout('user_initiated')} disabled={!hasMounted || isLoadingUser || !effectiveUser || isPendingLogout}>
                {isPendingLogout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(hasMounted && (!isMobile && sidebarState === 'expanded' || isMobile)) && (
             <Button variant="outline" size="sm" onClick={() => document.cookie = `sidebar_state=${sidebarState === 'expanded' ? 'collapsed' : 'expanded'}; path=/; max-age=${60*60*24*7}`} className="md:hidden">
              <PanelLeft className="mr-2 h-4 w-4" /> Collapse
            </Button>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8",
            "group-data-[variant=inset]/sidebar-wrapper:md:hidden" 
            )}>
          <SidebarTrigger className="md:hidden" /> 
           <div className="md:hidden group-data-[variant=inset]/sidebar-wrapper:md:flex group-data-[variant=inset]/sidebar-wrapper:md:items-center">
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {pageContent}
        </main>
      </SidebarInset>
    </>
  );
}
