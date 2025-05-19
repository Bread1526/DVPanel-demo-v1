
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
    if (isOpen && !isMaximized) {
      // Center dialog when it opens or image changes, unless maximized
      // Default dimensions (approximate, can be refined based on typical image sizes)
      const defaultWidth = Math.min(800, window.innerWidth * 0.8); // e.g., 80% of vw or 800px
      const defaultHeight = Math.min(600, window.innerHeight * 0.75); // e.g., 75% of vh or 600px
      
      setPosition({ 
        x: window.innerWidth / 2 - defaultWidth / 2, 
        y: window.innerHeight / 2 - defaultHeight / 2 
      });
    }
    if (isOpen) {
      setIsLoading(true);
      setError(null);
    }
  }, [isOpen, imageSrc, isMaximized]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMaximized || !dialogRef.current) return;
    
    const headerElement = dialogRef.current.querySelector('[data-dialog-header="true"]');
    // Check if the mousedown is on the header itself or an element within it that isn't a button
    if (headerElement && headerElement.contains(e.target as Node) && !(e.target as HTMLElement).closest('button')) {
      setIsDragging(true);
      const dialogRect = dialogRef.current.getBoundingClientRect();
      setDragStart({
        x: e.clientX - dialogRect.left,
        y: e.clientY - dialogRect.top,
      });
    }
  }, [isMaximized]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || isMaximized || !dialogRef.current) return;
    
    let newX = e.clientX - dragStart.x;
    let newY = e.clientY - dragStart.y;

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
      setPosition({x: 0, y: 0}); 
    }
    setIsMaximized(!isMaximized);
  };
  
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
      transform: 'none', 
    };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && isMaximized) setIsMaximized(false); 
        onOpenChange(open);
    }}>
      <DialogContent
        ref={dialogRef}
        className={cn(
          "p-0 flex flex-col shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ease-in-out",
          isMaximized 
            ? "w-screen h-screen max-w-full max-h-full !rounded-none" 
            : "w-[90vw] max-w-3xl h-[75vh] max-h-[800px]" // Default dimensions when not maximized
        )}
        style={dialogStyle}
        onOpenAutoFocus={(e) => e.preventDefault()} 
        hideCloseButton 
      >
        <DialogHeader
          data-dialog-header="true" 
          className={cn(
            "flex-shrink-0 flex flex-row items-center justify-between p-3 pl-4 border-b bg-muted/60",
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

        <div className={cn(
            "relative flex-grow flex items-center justify-center bg-background/80 backdrop-blur-sm min-h-0", // Added min-h-0 for flex-grow
            isMaximized ? "p-4" : "p-2"
          )}
        >
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
            <div className={cn(
                "relative w-full h-full flex items-center justify-center", 
                isDragging && "pointer-events-none"
              )}
            >
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
                    unoptimized 
                    data-ai-hint="file preview"
                  />
            </div>
          )}
           {!imageSrc && !isLoading && !error && (
             <div className="text-muted-foreground">No image to display.</div>
           )}
        </div>

        <DialogFooter className="flex-shrink-0 p-2 border-t bg-muted/60">
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
