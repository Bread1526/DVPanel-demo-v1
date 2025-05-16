
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
  // This layout should NOT render <html> or <body> tags.
  // The root layout (src/app/layout.tsx) handles those.
  // This main tag provides the specific styling for the login page.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-background to-slate-800 text-foreground">
      {children}
    </main>
  );
}
