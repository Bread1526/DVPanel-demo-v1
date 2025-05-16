
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
  // This layout is now rendered within AppShell.
  // The min-h-screen is removed as AppShell handles the overall page structure.
  // We keep the centering and specific background for the login form area.
  return (
    <main className="flex flex-grow flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-background to-slate-800 text-foreground">
      {children}
    </main>
  );
}
