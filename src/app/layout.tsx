
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
  const rawNextUrl = headersList.get('next-url');
  const hostHeader = headersList.get('host'); // Use a different variable name to avoid conflict

  // Log the raw headers for debugging
  console.log(`[RootLayout] Raw 'next-url' header: ${rawNextUrl}`);
  console.log(`[RootLayout] Host header: ${hostHeader}`);

  // Attempt to construct a full URL string if rawNextUrl is just a path
  // Default to '/' if rawNextUrl is null or undefined to avoid errors with new URL()
  let urlStringToParse = rawNextUrl || '/';
  if (rawNextUrl && rawNextUrl.startsWith('/') && hostHeader) {
    // Check if it's already a full URL (though less likely for 'next-url' if it's just a path)
    if (!rawNextUrl.startsWith('http://') && !rawNextUrl.startsWith('https://')) {
        urlStringToParse = `http://${hostHeader}${rawNextUrl}`;
    }
  } else if (!rawNextUrl) {
    // If rawNextUrl is null/undefined, we might be in an edge case.
    // Try 'x-invoke-path' as another potential source for the path.
    const invokePath = headersList.get('x-invoke-path');
    console.log(`[RootLayout] 'x-invoke-path' header: ${invokePath}`);
    if (invokePath) {
        urlStringToParse = `http://${hostHeader || 'localhost'}${invokePath}`;
    } else {
        // Fallback if all else fails
        urlStringToParse = `http://${hostHeader || 'localhost'}/`;
    }
  }


  console.log(`[RootLayout] URL string for parsing: ${urlStringToParse}`);
  
  let currentPath = '/'; // Default pathname
  try {
    // Use a default base if urlStringToParse might not be a full URL
    const base = `http://${hostHeader || 'localhost'}`;
    currentPath = new URL(urlStringToParse, base).pathname;
  } catch (e) {
    console.error(`[RootLayout] Error parsing URL '${urlStringToParse}':`, e);
    // Keep currentPath as '/' or some other safe default
  }
  
  console.log(`[RootLayout] Parsed Pathname: ${currentPath}`);
  const isLoginPage = currentPath === '/login';
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
