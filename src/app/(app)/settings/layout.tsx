
"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type React from 'react';
import { cn } from '@/lib/utils';
import { 
  SlidersHorizontal, 
  HardDrive, 
  Shield, 
  // MessageSquareMore, // Removed
  // Bug, // Removed
  Settings as SettingsIcon, 
  Info,
  ShieldCheck 
} from "lucide-react";

const settingsNavItems = [
  { href: '/settings/general', label: 'General', icon: SettingsIcon },
  { href: '/settings', label: 'Panel', icon: SlidersHorizontal }, 
  { href: '/settings/daemon', label: 'Daemon', icon: HardDrive },
  { href: '/settings/security', label: 'Security', icon: Shield },
  // { href: '/settings/popups', label: 'Popups', icon: MessageSquareMore }, // Removed
  // { href: '/settings/debug', label: 'Debug', icon: Bug }, // Removed
  { href: '/settings/license', label: 'License', icon: ShieldCheck },
  { href: '/settings/info', label: 'Info', icon: Info },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-6 border-b">
        <div className="overflow-x-auto whitespace-nowrap pb-1 no-scrollbar">
          <nav className="inline-flex gap-x-0.5 gap-y-1 p-1">
            {settingsNavItems.map((item) => {
              const isActive = item.href === '/settings' 
                                ? (pathname === '/settings' || pathname === '/settings/')
                                : pathname.startsWith(item.href);
              return (
                <Link key={item.label} href={item.href} passHref legacyBehavior>
                  <a
                    className={cn(
                      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </a>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
