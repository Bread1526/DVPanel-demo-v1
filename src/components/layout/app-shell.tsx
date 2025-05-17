
"use client";

import React, { useEffect, useState, useTransition, useCallback } from 'react';
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
  EyeOff
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
  isImpersonating?: boolean;
  originalUsername?: string;
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
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [originalUsername, setOriginalUsername] = useState<string | undefined>(undefined);


  const performLogout = useCallback(async (reason?: string) => {
    const storedSession = localStorage.getItem('dvpanel-session');
    let usernameToLogout, roleToLogout;
    if (storedSession) {
      try {
        const session: LocalSessionInfo = JSON.parse(storedSession);
        usernameToLogout = session.username;
        roleToLogout = session.role;
      } catch (e) {
        console.error("Error parsing session from localStorage during logout", e);
      }
    }
    
    localStorage.removeItem('dvpanel-session');
    setCurrentUserData(null);
    setIsPageAccessGranted(false); 
    setIsImpersonating(false);
    setOriginalUsername(undefined);
    
    try {
      await serverLogoutAction(usernameToLogout, roleToLogout); 
    } catch (e) {
      console.error("Error calling server logout action:", e);
    }
    
    router.push(`/login${reason ? `?reason=${reason}` : '?reason=logout'}`);
  }, [router]);

  useEffect(() => {
    const fetchUserAndCheckAccess = async () => {
      setIsLoadingUser(true);
      setIsPageAccessGranted(null);
      const storedSession = localStorage.getItem('dvpanel-session');

      if (!storedSession) {
        setCurrentUserData(null);
        setIsLoadingUser(false);
        if (pathname !== '/login') { // Ensure we are not already on login page
            performLogout('unauthorized');
        }
        return;
      }

      try {
        const session: LocalSessionInfo = JSON.parse(storedSession);
        const response = await fetch('/api/auth/user', {
          headers: {
            'X-Auth-Token': session.token,
            'X-Auth-Username': session.username,
            'X-Auth-Role': session.role,
          }
        });

        if (response.status === 401) {
          console.warn('[AppShell] Unauthorized or session expired via /api/auth/user. Logging out.');
          performLogout(pathname === '/login' ? undefined : 'unauthorized');
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to fetch user: ${response.statusText}`);
        }

        const data: ApiAuthUserResponse = await response.json();
        if (data.user) {
          setCurrentUserData(data.user);
          setIsImpersonating(data.isImpersonating ?? false);
          setOriginalUsername(data.originalUsername);
        } else {
          console.warn('[AppShell] No user data received from API. Logging out.');
          performLogout(pathname === '/login' ? undefined : 'unauthorized');
          return;
        }
      } catch (error) {
        console.error("[AppShell] Error fetching user:", error);
        performLogout(pathname === '/login' ? undefined : 'unauthorized');
        return;
      } finally {
        setIsLoadingUser(false);
      }
    };

    fetchUserAndCheckAccess();
  }, [pathname, performLogout]); 

  useEffect(() => {
    if (!isLoadingUser && currentUserData) {
      const effectiveUser = currentUserData; // This is the currently active user (could be impersonated)
      let hasAccess = false;
      
      if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') {
        hasAccess = true;
      } else if (effectiveUser.role === 'Admin') {
        const currentTopLevelPath = pathname.split('/')[1] || '';
        const adminAllowedBasePaths = ['dashboard', 'projects_page', 'files', 'ports', 'roles'];
        
        let baseAccess = adminAllowedBasePaths.some(basePageId => {
            const navItem = navItemsBase.find(item => item.requiredPage === basePageId);
            if (!navItem) return false;
            return navItem.href === '/' ? pathname === '/' : (pathname === navItem.href || pathname.startsWith(navItem.href + '/'));
        });

        if (currentTopLevelPath === 'settings') {
            const settingSubPage = pathname.split('/')[2] || 'panel';
            const requiredSettingPageId = `settings_${settingSubPage === '' ? 'panel' : settingSubPage}`;
            baseAccess = effectiveUser.allowedSettingsPages?.includes(requiredSettingPageId) ?? false;
        }
        hasAccess = baseAccess;

      } else if (effectiveUser.role === 'Custom' && effectiveUser.assignedPages) {
        const navItemMatch = navItemsBase.find(item => 
          item.href === '/' ? pathname === '/' : (pathname === item.href || pathname.startsWith(item.href + '/'))
        );
        if (navItemMatch?.requiredPage) {
          hasAccess = effectiveUser.assignedPages.includes(navItemMatch.requiredPage);
          
          if (navItemMatch.requiredPage === 'settings_area' && pathname.startsWith('/settings/')) {
            const settingSubPage = pathname.split('/')[2] || 'panel';
            const requiredSettingPageId = `settings_${settingSubPage === '' ? 'panel' : settingSubPage}`;
            const hasSettingSubPageAccess = effectiveUser.allowedSettingsPages?.includes(requiredSettingPageId) ?? false;
            hasAccess = hasAccess && hasSettingSubPageAccess;
          }
        } else if (pathname === '/') { 
           hasAccess = effectiveUser.assignedPages.includes('dashboard');
        }
      }
      
      setIsPageAccessGranted(hasAccess);

    } else if (!isLoadingUser && !currentUserData) {
      setIsPageAccessGranted(false); // No user data means no access.
    }
  }, [isLoadingUser, currentUserData, pathname]);


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
  
  const menuButtonRef = React.useRef<HTMLAnchorElement>(null);

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
                  ref={menuButtonRef} 
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
 
               let linkWrappedButton = (
                 <Link href={item.href} asChild>
                   {menuButton}
                 </Link>
               );
 
               if (sidebarState === 'collapsed' && !isMobile && item.label) {
                 return (
                   <SidebarMenuItem key={item.label}>
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
                   </SidebarMenuItem>
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
                  <AvatarImage src="https://placehold.co/100x100.png" alt="User" data-ai-hint="user avatar" />
                  <AvatarFallback>{isLoadingUser ? 'L' : effectiveUser?.username?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                </Avatar>
                <span className={cn(
                  "truncate",
                  { "hidden": sidebarState === 'collapsed' && !isMobile }
                )}>
                  {isLoadingUser ? "Loading..." : effectiveUser?.username ?? "Not Logged In"}
                  {isImpersonating && originalUsername && (
                    <span className="text-xs text-muted-foreground block">Admin: {originalUsername}</span>
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>
                {isImpersonating ? `Viewing as ${effectiveUser?.username}` : "My Account"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Stop Impersonation - Placeholder until actions are ready */}
              {/* {isImpersonating && (
                <>
                  <DropdownMenuItem onClick={async () => { 
                    // Placeholder for stopImpersonation action
                    console.log("Attempting to stop impersonation...");
                    // const result = await stopImpersonation();
                    // if (result.success) router.refresh(); else toast({ title: "Error", description: result.message, variant: "destructive" });
                   }}
                  >
                    <EyeOff className="mr-2 h-4 w-4" />
                    <span>Stop Impersonating</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )} */}
              <DropdownMenuItem disabled={!effectiveUser || isImpersonating}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!effectiveUser || isImpersonating} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => performLogout()} disabled={isLoadingUser && !effectiveUser}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out {isImpersonating ? `(as ${originalUsername})` : ""}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {isImpersonating && effectiveUser && (
          <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-yellow-500/90 dark:bg-yellow-600/90 text-yellow-900 dark:text-yellow-100 p-2 text-sm backdrop-blur-sm shadow">
            <AlertTriangle className="h-4 w-4" />
            <span>
              You are viewing as <strong>{effectiveUser.username}</strong> (Role: {effectiveUser.role}).
            </span>
            {/* Stop Impersonation Button - Placeholder */}
            {/* <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-current hover:bg-yellow-600/30 dark:hover:bg-yellow-700/30"
              onClick={async () => {
                // Placeholder for stopImpersonation action
                console.log("Attempting to stop impersonation...");
                // const result = await stopImpersonation();
                // if (result.success) router.refresh(); else toast({ title: "Error", description: result.message, variant: "destructive" });
              }}
            >
              <EyeOff className="mr-1 h-3 w-3" /> Stop Viewing
            </Button> */}
          </div>
        )}
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8",
          isImpersonating && "top-[40px]" 
        )}>
          <SidebarTrigger className="md:hidden" />
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          {isLoadingUser || isPageAccessGranted === null ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isPageAccessGranted ? (
            children
          ) : (
            <AccessDeniedOverlay /> 
          )}
        </main>
      </SidebarInset>
    </>
  );
}
