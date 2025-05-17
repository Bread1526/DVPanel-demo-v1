
"use client";

import type React from 'react';
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
  EyeOff, 
  AlertTriangle, 
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
import { useEffect, useState, useTransition } from 'react';
import { logout } from '@/app/(app)/logout/actions';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { stopImpersonation, type FullUserData } from '@/app/(app)/roles/actions'; 
import { useToast } from '@/hooks/use-toast';


const navItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, requiredPage: 'dashboard' },
  { href: '/projects', label: 'Projects', icon: Layers, count: 0, requiredPage: 'projects_page' }, // Count set to 0
  { href: '/files', label: 'File Manager', icon: FileText, requiredPage: 'files' },
  { href: '/ports', label: 'Port Manager', icon: Network, requiredPage: 'ports' },
  { href: '/roles', label: 'User Roles', icon: Users, requiredPage: 'roles' }, 
  { href: '/settings', label: 'Settings', icon: Settings, requiredPage: 'settings_area' },
];

interface AuthApiResponse {
  user: FullUserData | null; // Use FullUserData to include all permission fields
  isLoggedIn: boolean;
  isImpersonating?: boolean;
  originalUsername?: string;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  useActivityTracker(); 
  const pathname = usePathname();
  const { state: sidebarState, isMobile } = useSidebar(); 
  const router = useRouter();
  const { toast } = useToast();
  const [isPendingStopImpersonation, startStopImpersonationTransition] = useTransition();

  const [currentUserData, setCurrentUserData] = useState<AuthApiResponse>({ 
    user: null, 
    isLoggedIn: false, 
    isImpersonating: false, 
    originalUsername: undefined 
  });
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      setIsLoadingUser(true);
      try {
        const res = await fetch('/api/auth/user');
        if (res.ok) {
          const data: AuthApiResponse = await res.json();
          setCurrentUserData(data);
        } else {
          setCurrentUserData({ user: null, isLoggedIn: false, isImpersonating: false });
        }
      } catch (error) {
        console.error("Failed to fetch user", error);
        setCurrentUserData({ user: null, isLoggedIn: false, isImpersonating: false });
      } finally {
        setIsLoadingUser(false);
      }
    }
    fetchUser();
  }, [pathname]); 

  const handleLogout = async () => {
    await logout();
  };

  const handleStopImpersonation = async () => {
    startStopImpersonationTransition(async () => {
      try {
        await stopImpersonation(); // Action handles redirection
        // Toast might not be seen due to redirect, but useful if redirect fails.
        // The user data will re-fetch due to pathname change (redirect)
      } catch (error) {
        toast({ title: "Error", description: "Failed to stop impersonation.", variant: "destructive" });
      }
    });
  };
  
  const effectiveUser = currentUserData.user;
  const navItems = navItemsBase.filter(item => {
    if (!effectiveUser) return false; 
    if (effectiveUser.role === 'Owner' || effectiveUser.role === 'Administrator') return true;
    
    if (effectiveUser.role === 'Custom' && item.requiredPage) {
      return effectiveUser.assignedPages?.includes(item.requiredPage);
    }
    // For 'Admin' role, more complex logic might be needed if their page access isn't just "all standard pages"
    // For now, let's assume 'Admin' can access all base pages if they have any project access,
    // or define a specific list of pages they can always access.
    // This is a placeholder and should be refined based on precise 'Admin' role page permissions.
    if (effectiveUser.role === 'Admin') {
        // Example: Admins can see Dashboard, Projects, Files, Ports, their Settings.
        const adminAllowedPages = ['dashboard', 'projects_page', 'files', 'ports', 'settings_area'];
        return item.requiredPage ? adminAllowedPages.includes(item.requiredPage) : true;
    }
    return false; 
  });


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
                   // href, onClick, ref are passed by Link asChild, then by TooltipTrigger asChild
                >
                  <item.icon />
                  <span className={cn(
                    {"invisible group-data-[[data-state=collapsed]]:visible": sidebarState === 'collapsed' && !isMobile }, 
                    {"group-data-[[data-state=collapsed]]:hidden": sidebarState === 'collapsed' && !isMobile }
                  )}>
                    {item.label}
                  </span>
                  {item.count > 0 && ( // Conditionally render badge if count > 0
                     <SidebarMenuBadge className={cn(
                       {"group-data-[[data-state=collapsed]]:hidden": sidebarState === 'collapsed' && !isMobile}
                     )}>
                       {item.count}
                     </SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              );

              let finalElement;
              const linkElement = (
                <Link href={item.href} asChild>
                  {menuButton}
                </Link>
              );

              if (sidebarState === 'collapsed' && !isMobile && item.label) {
                 finalElement = (
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
                );
              } else {
                finalElement = linkElement;
              }
              
              return (
                <SidebarMenuItem key={item.label}>
                  {finalElement}
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
                  <AvatarFallback>{isLoadingUser ? 'L' : effectiveUser?.username?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                </Avatar>
                <span className={cn(
                  "truncate", // Ensure text truncates if too long
                  {"hidden": sidebarState === 'collapsed' && !isMobile}
                )}>
                  {isLoadingUser ? "Loading..." : effectiveUser?.username ?? "Not Logged In"}
                  {currentUserData.isImpersonating && currentUserData.originalUsername && (
                    <span className="text-xs text-muted-foreground block">Admin: {currentUserData.originalUsername}</span>
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>
                {currentUserData.isImpersonating ? `Viewing as ${effectiveUser?.username}` : "My Account"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {currentUserData.isImpersonating && (
                <>
                  <DropdownMenuItem onClick={handleStopImpersonation} disabled={isPendingStopImpersonation}>
                    <EyeOff className="mr-2 h-4 w-4" />
                    <span>Stop Impersonating</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem disabled={!effectiveUser || currentUserData.isImpersonating}> 
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!effectiveUser || currentUserData.isImpersonating} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={!currentUserData.isLoggedIn && !isLoadingUser}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out {currentUserData.isImpersonating ? `(as ${currentUserData.originalUsername})` : ""}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {currentUserData.isImpersonating && effectiveUser && (
          <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-yellow-400/80 dark:bg-yellow-600/80 text-yellow-900 dark:text-yellow-100 p-2 text-sm backdrop-blur-sm shadow">
            <AlertTriangle className="h-4 w-4" />
            <span>
              You are viewing as <strong>{effectiveUser.username}</strong> (Role: {effectiveUser.role}).
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-1 text-current hover:bg-yellow-500/30 dark:hover:bg-yellow-700/30"
              onClick={handleStopImpersonation}
              disabled={isPendingStopImpersonation}
            >
              <EyeOff className="mr-1 h-3 w-3"/> Stop Viewing
            </Button>
          </div>
        )}
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8",
          currentUserData.isImpersonating && "top-[40px]" // Adjust if banner is present, assuming banner height is 40px
        )}>
          <SidebarTrigger className="md:hidden" />
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
