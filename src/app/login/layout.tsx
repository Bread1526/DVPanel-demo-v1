// src/app/login/layout.tsx
import type { Metadata } from 'next';
import '../globals.css'; // Ensure global styles are available if not already through root

export const metadata: Metadata = {
  title: 'Login - DVPanel',
  description: 'Login to DVPanel',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This div will be rendered inside AppShell's main content area.
  // It provides specific styling for the login form container.
  return (
    <div className="flex flex-grow flex-col items-center justify-center p-4 w-full h-full bg-gradient-to-br from-slate-900 via-background to-slate-800 text-foreground">
      {children}
    </div>
  );
}
