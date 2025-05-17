
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, Inbox, FileJson } from "lucide-react";
import type { LogEntry } from "@/lib/logger";
import { fetchLogsAction, type FetchLogsResult } from "@/app/(app)/logs/actions";
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogsViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getLogLevelVariant(level: LogEntry['level']): { variant: "default" | "secondary" | "destructive" | "outline", className?: string } {
  switch (level) {
    case 'ERROR':
      return { variant: "destructive" };
    case 'WARN':
      return { variant: "outline", className: "border-yellow-500 text-yellow-600 bg-yellow-500/10 hover:bg-yellow-500/20 dark:border-yellow-400 dark:text-yellow-300 dark:bg-yellow-400/10 dark:hover:bg-yellow-400/20" };
    case 'INFO':
      return { variant: "secondary" };
    case 'AUTH':
      return { variant: "outline", className: "border-purple-500 text-purple-600 bg-purple-500/10 hover:bg-purple-500/20 dark:border-purple-400 dark:text-purple-300 dark:bg-purple-400/10 dark:hover:bg-purple-400/20" };
    case 'DEBUG':
      return { variant: "outline", className: "border-blue-500 text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 dark:border-blue-400 dark:text-blue-300 dark:bg-blue-400/10 dark:hover:bg-blue-400/20" };
    default:
      return { variant: "outline" };
  }
}

const renderDetails = (details: any) => {
  if (typeof details === 'string') {
    return details;
  }
  if (typeof details === 'object' && details !== null) {
    const detailString = JSON.stringify(details, null, 2);
    if (detailString.length > 100) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button variant="link" size="sm" className="p-0 h-auto text-xs text-primary hover:underline">
                <FileJson className="mr-1 h-3 w-3" /> View JSON
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-md max-h-80 overflow-auto bg-popover text-popover-foreground p-2 border shadow-lg rounded-md">
              <pre className="text-xs whitespace-pre-wrap">{detailString}</pre>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return <pre className="text-xs whitespace-pre-wrap">{detailString}</pre>;
  }
  return String(details ?? '');
};

export default function LogsViewerDialog({ open, onOpenChange }: LogsViewerDialogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start with false, load when dialog opens
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: FetchLogsResult = await fetchLogsAction();
      if (result.status === 'success' && result.logs) {
        setLogs(result.logs);
      } else if (result.error) {
        setError(result.error);
        setLogs([]);
      } else {
        setError("Failed to load logs with no specific error message.");
        setLogs([]);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(`An unexpected error occurred: ${err.message}`);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadLogs();
    } else {
      // Optionally clear logs or reset state when dialog closes
      // setLogs([]); 
      // setError(null);
    }
  }, [open, loadLogs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[80vh] flex flex-col rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Panel Activity Logs</DialogTitle>
          <DialogDescription>
            Displaying logs relevant to your access level. Newest entries are shown first.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-hidden py-4">
          <ScrollArea className="h-full pr-2">
            {isLoading && (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-3 text-muted-foreground">Loading logs...</p>
              </div>
            )}
            {error && !isLoading && (
              <Alert variant="destructive" className="my-4">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle>Error Loading Logs</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {!isLoading && !error && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground">No Logs Found</h3>
                <p className="text-muted-foreground">There are no log entries to display for your current role.</p>
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
                  {logs.slice().reverse().map((log, index) => (
                    <TableRow key={`${log.timestamp}-${index}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss.SSS")}
                      </TableCell>
                      <TableCell>
                        <Badge {...getLogLevelVariant(log.level)}>{log.level}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{log.username}</TableCell>
                      <TableCell className="text-muted-foreground">{log.role}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{renderDetails(log.details)}</TableCell>
                      <TableCell className="text-muted-foreground">{log.targetUser || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">{log.targetRole || 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>
        <DialogFooter className="pt-4 border-t">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
