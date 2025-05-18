
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, AlertCircle, ScrollText, FileJson } from "lucide-react";
import { fetchLogsAction } from '@/app/(app)/logs/actions';
import type { FetchLogsResult } from '@/app/(app)/logs/types';
import type { LogEntry } from '@/lib/logger'; // Ensure LogEntry is exported from logger.ts
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogsViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getLogLevelVariant = (level: LogEntry['level']): "default" | "secondary" | "destructive" | "outline" => {
  switch (level) {
    case 'ERROR':
      return 'destructive';
    case 'WARN':
      return 'secondary'; // Often yellow, but secondary is a neutral-ish theme color
    case 'AUTH':
      return 'outline'; // Could be themed blue or similar
    case 'INFO':
      return 'default'; // Primary theme color
    case 'DEBUG':
      return 'default'; // Could be a lighter shade or same as INFO
    default:
      return 'default';
  }
};

const renderDetails = (details: any) => {
  if (!details) return 'N/A';
  if (typeof details === 'string') {
    return details.length > 50 ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate cursor-help">{details.substring(0, 50)}...</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-md break-words">
            <p>{details}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : details;
  }
  if (typeof details === 'object') {
    const jsonString = JSON.stringify(details, null, 2);
    if (jsonString.length > 100) { // Arbitrary limit for inline display
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
                <FileJson className="mr-1 h-3 w-3" /> View JSON
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-lg bg-background text-foreground border shadow-lg rounded-md">
              <ScrollArea className="h-64">
                <pre className="text-xs p-2 whitespace-pre-wrap break-all">{jsonString}</pre>
              </ScrollArea>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return <pre className="text-xs whitespace-pre-wrap break-all">{jsonString}</pre>;
  }
  return String(details);
};

export default function LogsViewerDialog({ open, onOpenChange }: LogsViewerDialogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!open) return; // Don't fetch if dialog is not open

    setIsLoading(true);
    setError(null);
    try {
      const result: FetchLogsResult = await fetchLogsAction();
      if (result.status === 'success' && result.logs) {
        setLogs(result.logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())); // Newest first
      } else if (result.status === 'error') {
        setError(result.error || 'Failed to load logs.');
        setLogs([]);
      } else {
        setError('Unauthorized to view logs or no logs found.');
        setLogs([]);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(`An unexpected error occurred: ${err.message}`);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      loadLogs();
    }
  }, [open, loadLogs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[80vh] flex flex-col rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Panel Activity Logs
          </DialogTitle>
        </DialogHeader>
        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-2">
            {isLoading && (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading logs...</p>
              </div>
            )}
            {error && !isLoading && (
              <div className="flex flex-col justify-center items-center h-64 p-4 bg-destructive/10 text-destructive border border-destructive/30 rounded-md">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="font-semibold">Error Loading Logs</p>
                <p className="text-sm text-center">{error}</p>
                <Button onClick={loadLogs} variant="outline" size="sm" className="mt-4">Try Again</Button>
              </div>
            )}
            {!isLoading && !error && logs.length === 0 && (
              <div className="flex justify-center items-center h-64 text-muted-foreground">
                <p>No log entries found.</p>
              </div>
            )}
            {!isLoading && !error && logs.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[100px]">Level</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Target User</TableHead>
                    <TableHead>Target Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log, index) => (
                    <TableRow key={`${log.timestamp}-${index}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss.SSS")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getLogLevelVariant(log.level)} className="text-xs">
                          {log.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.username}</TableCell>
                      <TableCell className="text-sm">{log.role}</TableCell>
                      <TableCell className="text-sm">{log.action}</TableCell>
                      <TableCell className="text-xs max-w-xs">{renderDetails(log.details)}</TableCell>
                      <TableCell className="text-sm">{log.targetUser || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{log.targetRole || 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
        <DialogFooter className="pt-4 border-t">
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
