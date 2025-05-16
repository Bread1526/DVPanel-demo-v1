// src/app/not-found.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
          <h1 className="text-5xl font-bold text-foreground mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-muted-foreground mb-6">Page Not Found</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Button asChild className="shadow-md hover:scale-105 transform transition-transform duration-150">
            <Link href="/">Go to Dashboard</Link>
          </Button>
        </div>
      </body>
    </html>
  );
}
