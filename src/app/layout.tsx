
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import AppShell from '@/components/layout/app-shell';
import { SidebarProvider } from '@/components/ui/sidebar';
import { headers } from 'next/headers'; // Import headers

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
  const headersList = headers();
  // Read the full URL from the 'next-url' header (provided by Next.js in Server Components)
  // or default to '/' if the header is not present (e.g., during pre-rendering or some edge cases).
  const urlString = headersList.get('next-url') ?? '/';
  // Use a base URL just in case urlString is only a pathname, to ensure URL constructor works.
  const currentPath = new URL(urlString, 'http://localhost').pathname;

  const isLoginPage = currentPath === '/login';

  // Server-side logging for debugging
  console.log(`[RootLayout] Current URL String: ${urlString}`);
  console.log(`[RootLayout] Current Pathname: ${currentPath}`);
  console.log(`[RootLayout] isLoginPage: ${isLoginPage}`);

  if (isLoginPage) {
    console.log('[RootLayout] Rendering login page without AppShell.');
  } else {
    console.log('[RootLayout] Rendering standard page with AppShell.');
  }

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
          {isLoginPage ? (
            children // For /login, render children directly (which comes from login/layout.tsx)
          ) : (
            <SidebarProvider defaultOpen>
              <AppShell>{children}</AppShell>
            </SidebarProvider>
          )}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
