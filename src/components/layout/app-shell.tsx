
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
import { useEffect, useState } from 'react';
import { logout } from '@/app/(app)/logout/actions';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: Layers, count: 5 },
  { href: '/files', label: 'File Manager', icon: FileText },
  { href: '/ports', label: 'Port Manager', icon: Network },
  { href: '/roles', label: 'User Roles', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface CurrentUser {
  id: string;
  username: string;
  role: string;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  useActivityTracker(); 
  const pathname = usePathname();
  const { state: sidebarState, isMobile } = useSidebar(); 
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      setIsLoadingUser(true);
      try {
        const res = await fetch('/api/auth/user');
        if (res.ok) {
          const data = await res.json();
          if (data.isLoggedIn && data.user) {
            setCurrentUser(data.user);
          } else {
            setCurrentUser(null); 
          }
        } else {
           setCurrentUser(null);
        }
      } catch (error) {
        console.error("Failed to fetch user", error);
        setCurrentUser(null);
      } finally {
        setIsLoadingUser(false);
      }
    }
    fetchUser();
  }, [pathname]); 

  const handleLogout = async () => {
    await logout();
  };

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
                  // href={item.href} // href is handled by the parent Link
                  // onClick prop is also implicitly handled by Link when wrapping a component
                >
                  <item.icon />
                  <span className={cn(
                    {"invisible group-data-[[data-state=collapsed]]:visible": sidebarState === 'collapsed' && !isMobile }, 
                    {"group-data-[[data-state=collapsed]]:hidden": sidebarState === 'collapsed' && !isMobile }
                  )}>
                    {item.label}
                  </span>
                  {item.count && (
                     <SidebarMenuBadge className={cn(
                       {"group-data-[[data-state=collapsed]]:hidden": sidebarState === 'collapsed' && !isMobile}
                     )}>
                       {item.count}
                     </SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              );

              let finalElement;

              // Use Link with legacyBehavior and passHref for stable behavior with TooltipTrigger
              const linkWrappedButton = (
                 <Link href={item.href} legacyBehavior passHref>
                   {menuButton}
                 </Link>
               );


              if (sidebarState === 'collapsed' && !isMobile && item.label) {
                 finalElement = (
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
              } else {
                finalElement = linkWrappedButton;
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
                  <AvatarFallback>{isLoadingUser ? 'L' : currentUser?.username?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                </Avatar>
                <span className={cn(
                  {"hidden": sidebarState === 'collapsed' && !isMobile}
                )}>
                  {isLoadingUser ? "Loading..." : currentUser?.username ?? "Not Logged In"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!currentUser}>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!currentUser} onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={!currentUser && !isLoadingUser}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:px-8">
          <SidebarTrigger className="md:hidden" />
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}

    
