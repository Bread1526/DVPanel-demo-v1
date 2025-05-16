// src/app/(app)/layout.tsx
"use client"; // AppShell and SidebarProvider are client components

import type React from 'react';
import AppShell from '@/components/layout/app-shell';
import { SidebarProvider } from '@/components/ui/sidebar';

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout wraps all authenticated pages with the AppShell
  return (
    <SidebarProvider defaultOpen>
      <AppShell>{children}</AppShell>
    </SidebarProvider>
  );
}
