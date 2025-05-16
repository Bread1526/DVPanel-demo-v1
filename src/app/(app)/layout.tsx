// src/app/(app)/layout.tsx
import type React from 'react';

// This layout is now a simple pass-through since AppShell is global.
export default function AppPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
