
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X, Expand, Shrink, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageViewerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  imageAlt: string | null;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

export default function ImageViewerDialog({
  isOpen,
  onOpenChange,
  imageSrc,
  imageAlt,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: ImageViewerDialogProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Center dialog when it opens or image changes, unless maximized
      if (!isMaximized) {
        setPosition({ x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 }); // Assuming default 800x600
      }
      setIsLoading(true);
      setError(null);
    }
  }, [isOpen, imageSrc, isMaximized]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMaximized) return;
    // Check if the mousedown is on the header itself, not on buttons inside it
    if (e.target === e.currentTarget.closest('[role="dialog"]')?.querySelector('[data-dialog-header="true"]')) {
        setIsDragging(true);
        const dialogRect = dialogRef.current?.getBoundingClientRect();
        if (dialogRect) {
            setDragStart({
                x: e.clientX - dialogRect.left,
                y: e.clientY - dialogRect.top,
            });
        }
    }
  }, [isMaximized]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || isMaximized || !dialogRef.current) return;
    
    let newX = e.clientX - dragStart.x;
    let newY = e.clientY - dragStart.y;

    // Boundary checks (optional, can make dragging feel constrained)
    // const parentWidth = window.innerWidth;
    // const parentHeight = window.innerHeight;
    // const dialogWidth = dialogRef.current.offsetWidth;
    // const dialogHeight = dialogRef.current.offsetHeight;
    // newX = Math.max(0, Math.min(newX, parentWidth - dialogWidth));
    // newY = Math.max(0, Math.min(newY, parentHeight - dialogHeight));

    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart, isMaximized]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
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

  const toggleMaximize = () => {
    if (isMaximized) {
      setPosition(prevPosition);
    } else {
      if (dialogRef.current) {
        const rect = dialogRef.current.getBoundingClientRect();
        setPrevPosition({ x: rect.left, y: rect.top });
      }
      setPosition({x: 0, y: 0}); // Reset position for maximized view
    }
    setIsMaximized(!isMaximized);
  };

  if (!isOpen) {
    return null;
  }
  
  const dialogStyle: React.CSSProperties = isMaximized
  ? {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      transform: 'none',
      borderRadius: '0',
      margin: '0',
    }
  : {
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      transform: 'none', // Remove centering transform
    };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && isMaximized) setIsMaximized(false); // Reset maximized state on close
        onOpenChange(open);
    }}>
      <DialogContent
        ref={dialogRef}
        className={cn(
          "sm:max-w-3xl p-0 flex flex-col shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ease-in-out",
           isMaximized && "w-screen h-screen max-w-full max-h-full !rounded-none"
        )}
        style={dialogStyle}
        onOpenAutoFocus={(e) => e.preventDefault()} // Prevent auto-focus interfering with drag
        hideCloseButton // We'll use our custom close button
      >
        <DialogHeader
          data-dialog-header="true" // Custom attribute to identify header for dragging
          className={cn(
            "flex flex-row items-center justify-between p-3 pl-4 border-b bg-muted/60",
            !isMaximized && "cursor-grab active:cursor-grabbing"
          )}
          onMouseDown={handleMouseDown}
        >
          <DialogTitle className="text-sm font-medium truncate max-w-[calc(100%-100px)]">
            {imageAlt || 'Image Viewer'}
          </DialogTitle>
          <div className="flex items-center gap-1">
             <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMaximize}>
              {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className={cn("relative flex-grow flex items-center justify-center bg-background/80 backdrop-blur-sm p-2", isMaximized ? "p-4" : "p-2")}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center text-destructive p-4">
              <AlertTriangle className="h-10 w-10 mb-2" />
              <p className="font-semibold">Error loading image</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
          {imageSrc && !error && (
            <div className={cn("relative w-full h-full flex items-center justify-center", isDragging && "pointer-events-none")}>
                 <Image
                    src={imageSrc}
                    alt={imageAlt || 'Displayed image'}
                    fill
                    style={{ objectFit: 'contain' }}
                    onLoadingComplete={() => setIsLoading(false)}
                    onError={() => {
                        setError('Failed to load image resource.');
                        setIsLoading(false);
                    }}
                    unoptimized // Good for direct API served images that might not have optimization headers
                    data-ai-hint="file preview"
                  />
            </div>
          )}
           {!imageSrc && !isLoading && !error && (
             <div className="text-muted-foreground">No image to display.</div>
           )}
        </div>

        <DialogFooter className="p-2 border-t bg-muted/60 flex-shrink-0">
          <div className="flex justify-between w-full items-center">
            <Button
              variant="outline"
              size="icon"
              onClick={onPrevious}
              disabled={!hasPrevious || isLoading}
              className="shadow-md"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onNext}
              disabled={!hasNext || isLoading}
              className="shadow-md"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
