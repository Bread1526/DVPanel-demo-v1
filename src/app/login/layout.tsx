// src/app/login/layout.tsx
import type { Metadata } from 'next';
import '../globals.css'; // Import global styles

export const metadata: Metadata = {
  title: 'Login - DVPanel',
  description: 'Login to DVPanel',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This <main> tag provides the specific styling for the login page.
  // It will be a direct child of <body> from the RootLayout when on the /login route.
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-background to-slate-800 text-foreground">
      {children}
    </main>
  );
}
