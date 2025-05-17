
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
  const [isPendingLogout, startLogoutTransition] = React.useTransition();
  
  const performLogout = useCallback(async () => {
    if (debugMode) console.log('[AppShell] performLogout initiated.');
    startLogoutTransition(async () => {
      try {
        await serverLogoutAction(); 
        if (debugMode) console.log('[AppShell] Server logout action completed.');
      } catch (e) {
        console.error("[AppShell] Error calling server logout action:", e);
        toast({ title: "Logout Error", description: "Failed to logout on server.", variant: "destructive" });
      }
      
      setCurrentUserData(null);
      setIsPageAccessGranted(false); 
      if (debugMode) console.log(`[AppShell] performLogout finished, redirecting to /login.`);
      router.push(`/login?reason=logout`);
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
          if (response.status === 401) {
             performLogout(pathname === '/login' ? undefined : 'unauthorized');
          } else {
             performLogout('session_error');
          }
          return;
        }

        const data: ApiAuthUserResponse = await response.json();
        if (debugMode) console.log('[AppShell] Data from /api/auth/user:', data.user ? { id: data.user.id, username: data.user.username, role: data.user.role } : "No user data");

        if (data.user) {
          setCurrentUserData(data.user);
        } else {
          if (debugMode) console.warn('[AppShell] No user object in successful /api/auth/user response. Performing logout.');
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
  }, [pathname, debugMode, performLogout]);

  useEffect(() => {
    if (isLoadingUser || !currentUserData) {
      if (debugMode && !isLoadingUser && !currentUserData) console.log('[AppShell] Page access check: No current user data or still loading, access not determined yet.');
      setIsPageAccessGranted(null); 
      return;
    }
    
    const effectiveUser = currentUserData;
    let hasAccess = false;
    
    const pathSegments = pathname.split('/').filter(Boolean);
    const currentTopLevelPath = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';

    const targetPage = navItemsBase.find(item => item.href === currentTopLevelPath);
    const requiredPageId = targetPage?.requiredPage || (pathname === '/' ? 'dashboard' : null);


    if (debugMode) console.log(`[AppShell] Page access check for path: "${pathname}", topLevelPath: "${currentTopLevelPath}", effectiveUser role: "${effectiveUser.role}", requiredPageId: "${requiredPageId}"`);

    if (effectiveUser.status === 'Inactive') {
        hasAccess = false;
        if (debugMode) console.log('[AppShell] Page access: Denied (User Inactive)');
    } else if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
      hasAccess = true; 
      if (debugMode) console.log('[AppShell] Page access: Granted (Owner/Administrator)');
    } else if (effectiveUser.role === 'Admin') {
      if (requiredPageId && requiredPageId.startsWith('settings_')) {
        hasAccess = effectiveUser.allowedSettingsPages?.includes(requiredPageId.replace('settings_area', 'settings')) ?? false;
        if (debugMode) console.log(`[AppShell] Page access (Admin, settings): ${hasAccess} for ${requiredPageId}`);
      } else if (requiredPageId) {
        const adminAllowedAppPages = ['dashboard', 'projects_page', 'files', 'ports', 'roles', 'settings_area']; 
        hasAccess = adminAllowedAppPages.includes(requiredPageId);
        if (debugMode) console.log(`[AppShell] Page access (Admin, app page): ${hasAccess} for ${requiredPageId}`);
      } else {
        hasAccess = false; 
        if (debugMode) console.log(`[AppShell] Page access (Admin, unknown page): ${hasAccess} for ${requiredPageId}`);
      }
    } else if (effectiveUser.role === 'Custom' && effectiveUser.assignedPages) {
       if (requiredPageId && requiredPageId.startsWith('settings_')) {
         hasAccess = (effectiveUser.assignedPages.includes('settings_area') && (effectiveUser.allowedSettingsPages?.includes(requiredPageId.replace('settings_area', 'settings')) ?? false));
         if (debugMode) console.log(`[AppShell] Page access (Custom, settings): ${hasAccess} for ${requiredPageId}`);
       } else if (requiredPageId) {
         hasAccess = effectiveUser.assignedPages.includes(requiredPageId);
         if (debugMode) console.log(`[AppShell] Page access (Custom, app page): ${hasAccess} for ${requiredPageId}`);
       } else {
         hasAccess = false; 
         if (debugMode) console.log(`[AppShell] Page access (Custom, unknown page): ${hasAccess} for ${requiredPageId}`);
       }
    } else {
      hasAccess = false; 
    }
    
    setIsPageAccessGranted(hasAccess);
    if (debugMode) console.log(`[AppShell] Final isPageAccessGranted: ${hasAccess} for path ${pathname}`);

  }, [isLoadingUser, currentUserData, pathname, debugMode]);


  const effectiveUser = currentUserData;

  const navItems = navItemsBase.filter(item => {
    if (!effectiveUser || effectiveUser.status === 'Inactive') return false; 
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


  let pageContent;
  if (isLoadingUser || (currentUserData && isPageAccessGranted === null)) { 
    pageContent = (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  } else if (effectiveUser && isPageAccessGranted === true) {
    pageContent = children;
  } else if (effectiveUser && isPageAccessGranted === false) { 
    pageContent = <AccessDeniedOverlay />;
  } else { 
    if (debugMode && !isLoadingUser && !currentUserData) console.log('[AppShell] Reached unhandled content rendering state. This may happen briefly during logout/redirect.');
    pageContent = (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading session...</p>
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
                  isActive={isActive}
                  variant="default"
                  size="default"
                  // href, onClick, etc. are passed by Link asChild
                >
                  <item.icon />
                  <span className={cn(
                    "truncate",
                    { "hidden": sidebarState === 'collapsed' && !isMobile }
                  )}>
                    {item.label}
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <SidebarMenuBadge className={cn({ "hidden": sidebarState === 'collapsed' && !isMobile })}>{item.count}</SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              );

              let navLink = (
                <Link href={item.href} asChild>
                  {/* The menuButton (SidebarMenuButton) will receive props from Link like href, onClick, ref */}
                  {menuButton}
                </Link>
              );

              if (sidebarState === 'collapsed' && !isMobile && item.label) {
                navLink = (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* TooltipTrigger passes its props to Link asChild */}
                        {navLink} 
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              return <SidebarMenuItem key={item.label}>{navLink}</SidebarMenuItem>;
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
              <DropdownMenuItem disabled={!effectiveUser || isLoadingUser || isPendingLogout}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!effectiveUser || isLoadingUser || isPendingLogout} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={performLogout} disabled={isLoadingUser || !effectiveUser || isPendingLogout}>
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
