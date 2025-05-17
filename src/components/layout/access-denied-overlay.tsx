
"use client";

import { Shield } from 'lucide-react'; // Changed from ShieldLock to Shield

export default function AccessDeniedOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <Shield className="h-24 w-24 text-destructive mb-6" /> {/* Changed from ShieldLock to Shield */}
      <h2 className="text-3xl font-bold text-foreground mb-3">501</h2>
      <p className="text-xl text-muted-foreground">You are not permitted to be here.</p>
    </div>
  );
}
