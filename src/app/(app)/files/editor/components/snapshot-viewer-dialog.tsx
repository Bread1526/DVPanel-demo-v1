
"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CodeEditor from '@/components/ui/code-editor'; 
import type { Snapshot } from '../[...filePath]/page'; 
import { format } from 'date-fns';

interface SnapshotViewerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: Snapshot | null;
}

export default function SnapshotViewerDialog({
  isOpen,
  onOpenChange,
  snapshot,
}: SnapshotViewerDialogProps) {
  if (!snapshot) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl h-[80vh] flex flex-col p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-4 border-b bg-muted/50 flex-shrink-0">
          <DialogTitle>Snapshot Viewer</DialogTitle>
          <DialogDescription>
            Viewing snapshot from: {format(new Date(snapshot.timestamp), 'PPp HH:mm:ss')} - Language: {snapshot.language}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow relative min-h-0 bg-background">
          <CodeEditor
            value={snapshot.content}
            onChange={() => {}} 
            language={snapshot.language}
            readOnly={true}
            className="h-full w-full border-0 rounded-none"
          />
        </div>

        <DialogFooter className="p-4 border-t bg-muted/50 flex-shrink-0">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
