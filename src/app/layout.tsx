// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
// SidebarProvider and AppShell are NOT imported or used here directly.
// They are managed by src/app/(app)/layout.tsx for authenticated routes.

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'DVPanel',
  description: 'High-performance, secure, modular web-based control panel.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // This RootLayout no longer checks the path or conditionally renders AppShell.
  // It provides the global HTML structure, theme, and toaster.
  // The decision to show AppShell or not is handled by nested layouts
  // (e.g., src/app/(app)/layout.tsx vs src/app/login/layout.tsx).
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children} {/* Children will be (app)/layout.tsx content or login/layout.tsx content */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
