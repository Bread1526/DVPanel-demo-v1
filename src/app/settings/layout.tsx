
"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type React from 'react';
import { cn } from '@/lib/utils';
import { SlidersHorizontal, HardDrive, Shield, MessageSquareMore, Bug, Settings as SettingsIcon, Info } from "lucide-react";

const settingsNavItems = [
  { href: '/settings', label: 'Panel', icon: SlidersHorizontal },
  { href: '/settings/daemon', label: 'Daemon', icon: HardDrive },
  { href: '/settings/security', label: 'Security', icon: Shield },
  { href: '/settings/popups', label: 'Popups', icon: MessageSquareMore },
  { href: '/settings/debug', label: 'Debug', icon: Bug },
  { href: '/settings/general', label: 'General', icon: SettingsIcon },
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
        <nav className="flex flex-wrap gap-x-2 gap-y-1 p-1 -mb-px">
          {settingsNavItems.map((item) => (
            <Link key={item.label} href={item.href} passHref legacyBehavior>
              <a
                className={cn(
                  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  (pathname === item.href || (item.href === '/settings' && pathname === '/settings')) // Adjusted for base /settings route
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </a>
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
