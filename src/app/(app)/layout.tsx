// src/app/(app)/layout.tsx
import type React from 'react';
import AppShell from '@/components/layout/app-shell';
import { SidebarProvider } from '@/components/ui/sidebar';

// This layout applies to all routes within the (app) group.
export default function AppPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <AppShell>{children}</AppShell>
    </SidebarProvider>
  );
}
