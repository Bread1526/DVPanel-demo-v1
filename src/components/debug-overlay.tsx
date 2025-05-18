
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AuthenticatedUser } from '@/lib/session';
import { ScrollArea } from './ui/scroll-area';

interface DebugOverlayProps {
  currentUserData: AuthenticatedUser | null;
  pathname: string;
  sidebarState: 'expanded' | 'collapsed';
  isMobile: boolean;
  onClose: () => void;
}

export default function DebugOverlay({
  currentUserData,
  pathname,
  sidebarState,
  isMobile,
  onClose,
}: DebugOverlayProps) {
  const { toast } = useToast();
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (overlayRef.current && e.target === overlayRef.current.firstChild) { // Only drag by header
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    let newX = e.clientX - dragStartRef.current.x;
    let newY = e.clientY - dragStartRef.current.y;

    // Boundary checks
    const overlayWidth = overlayRef.current?.offsetWidth || 0;
    const overlayHeight = overlayRef.current?.offsetHeight || 0;
    newX = Math.max(0, Math.min(newX, window.innerWidth - overlayWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - overlayHeight));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const testInfoToast = () => {
    toast({
      title: "Info Toast Test",
      description: "This is a test informational toast from the debug overlay.",
    });
  };

  const testErrorToast = () => {
    try {
      throw new Error("Simulated error for debug toast with console details.");
    } catch (e: any) {
      const errorDetails = `Message: ${e.message}\nStack: ${e.stack}`;
      toast({
        title: "Error Toast Test (Debug)",
        description: "This is a test error toast. Check console for more. (Error details included if user's 'Show Console Errors' setting is on)",
        variant: "destructive",
        errorContent: errorDetails, // Pass full error details for the copy button
      });
      if (currentUserData?.userSettings?.popup?.showConsoleErrorsInNotifications && currentUserData?.userSettings?.debugMode) {
        console.error("Simulated Error for Debug Toast:", e);
      }
    }
  };
  
  const handleClearLocalStorage = () => {
    if (window.confirm("Are you sure you want to clear all localStorage for this domain? This will log you out.")) {
      localStorage.clear();
      toast({ title: "LocalStorage Cleared", description: "You will be logged out shortly."});
      // Optionally force a reload or redirect to trigger logout logic in AppShell
       window.location.reload();
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed bg-card text-card-foreground border border-border shadow-2xl rounded-lg w-96 max-w-[calc(100vw-40px)] max-h-[calc(100vh-40px)] flex flex-col z-[5000]"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <CardHeader 
        className="flex flex-row items-center justify-between py-3 px-4 cursor-grab active:cursor-grabbing border-b"
        onMouseDown={handleMouseDown}
      >
        <CardTitle className="text-base flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2 text-primary" /> Debug Overlay
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <ScrollArea className="flex-grow overflow-y-auto">
        <CardContent className="p-4 space-y-3 text-xs">
          <div>
            <h4 className="font-semibold mb-1 text-sm">Current User:</h4>
            <pre className="p-2 bg-muted rounded-md text-muted-foreground whitespace-pre-wrap break-all">
              {currentUserData ? JSON.stringify({
                id: currentUserData.id,
                username: currentUserData.username,
                role: currentUserData.role,
                status: currentUserData.status,
                assignedPages: currentUserData.assignedPages,
                allowedSettingsPages: currentUserData.allowedSettingsPages,
                projects: currentUserData.projects,
                userSettings: currentUserData.userSettings,
                globalDebugMode: currentUserData.globalDebugMode,
              }, null, 2) : 'null'}
            </pre>
          </div>
          <div>
            <p><span className="font-semibold">Pathname:</span> {pathname}</p>
            <p><span className="font-semibold">Sidebar State:</span> {sidebarState}</p>
            <p><span className="font-semibold">Is Mobile:</span> {isMobile ? 'Yes' : 'No'}</p>
          </div>
          <div className="space-y-2 pt-2 border-t">
            <h4 className="font-semibold text-sm mb-1">Actions:</h4>
            <Button onClick={testInfoToast} size="sm" variant="outline" className="w-full">Test Info Toast</Button>
            <Button onClick={testErrorToast} size="sm" variant="destructive" className="w-full">Test Error Toast</Button>
            <Button onClick={handleClearLocalStorage} size="sm" variant="outline" className="w-full flex items-center">
              <Trash2 className="mr-2 h-4 w-4"/> Clear LocalStorage
            </Button>
          </div>
        </CardContent>
      </ScrollArea>
    </div>
  );
}
