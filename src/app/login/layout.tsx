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
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
          {children}
        </main>
      </body>
    </html>
  );
}
