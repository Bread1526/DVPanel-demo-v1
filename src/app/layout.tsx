
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
  // next-url is a header automatically provided by Next.js in Server Components
  const urlString = headersList.get('next-url') ?? '/'; 
  // Provide a base URL for robustness in case urlString is just a pathname
  const currentPath = new URL(urlString, 'http://localhost').pathname; 

  const isLoginPage = currentPath === '/login';

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
            children // For /login, render children directly without AppShell
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
