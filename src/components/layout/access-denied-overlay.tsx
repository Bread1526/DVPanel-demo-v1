
"use client";

import { ShieldLock } from 'lucide-react';

export default function AccessDeniedOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <ShieldLock className="h-24 w-24 text-destructive mb-6" />
      <h2 className="text-3xl font-bold text-foreground mb-3">501</h2>
      <p className="text-xl text-muted-foreground">You are not permitted to be here.</p>
    </div>
  );
}
