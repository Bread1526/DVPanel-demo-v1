
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
  ArrowLeft,
  Camera,
  Search as SearchIcon,
  FileWarning,
  Lock,
  Unlock,
  Eye,
  Trash2,
} from "lucide-react";
import path from 'path-browserify';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { openSearchPanel } from '@codemirror/search';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { v4 as uuidv4 } from 'uuid';
import { format, formatDistanceToNowStrict } from 'date-fns';
import SnapshotViewerDialog from '../components/snapshot-viewer-dialog'; // Corrected import path

// Helper function to get language from filename
function getLanguageFromFilename(filename: string): string {
  if (!filename) return 'plaintext';
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'html': case 'htm': return 'html';
    case 'css': case 'scss': return 'css';
    case 'json': return 'json';
    case 'yaml': case 'yml': return 'yaml';
    case 'md': return 'markdown';
    case 'py': return 'python';
    case 'sh': return 'shell';
    default: return 'plaintext';
  }
}

export interface Snapshot {
  id: string;
  timestamp: string; // ISO string
  content: string;
  language: string;
  isLocked?: boolean;
}

const DAEMON_API_BASE_PATH = '/api/panel-daemon';
const MAX_SERVER_SNAPSHOTS = 10; // As defined in the backend API

export default function FileEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const [fileContent, setFileContent] = useState<string>('');
  const [originalFileContent, setOriginalFileContent] = useState<string>('');
  const [isWritable, setIsWritable] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [editorLanguage, setEditorLanguage] = useState<string>('plaintext');

  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  const encodedFilePathFromParams = params.filePath;

  const decodedFilePath = useMemo(() => {
    let pathArray = Array.isArray(encodedFilePathFromParams) ? encodedFilePathFromParams : [encodedFilePathFromParams].filter(Boolean);
    if (pathArray.length === 0 && typeof encodedFilePathFromParams === 'string' && encodedFilePathFromParams) {
      pathArray = [encodedFilePathFromParams];
    }
    const joinedPath = pathArray.join('/');
    if (!joinedPath) return '';
    try {
      return decodeURIComponent(joinedPath);
    } catch (e) {
      console.error("Failed to decode file path:", e);
      return '';
    }
  }, [encodedFilePathFromParams]);

  const fileName = useMemo(() => path.basename(decodedFilePath || 'Untitled'), [decodedFilePath]);
  const hasUnsavedChanges = useMemo(() => fileContent !== originalFileContent, [fileContent, originalFileContent]);

  const fetchSnapshots = useCallback(async () => {
    if (!decodedFilePath) return;
    console.log(`[FileEditorPage] fetchSnapshots called for: ${decodedFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/snapshots?filePath=${encodeURIComponent(decodedFilePath)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching snapshots: ${response.statusText}`}));
        throw new Error(errData.error || errData.details || `Failed to fetch snapshots. Status: ${response.status}`);
      }
      const data = await response.json();
      setServerSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
      console.log(`[FileEditorPage] fetchSnapshots SUCCESS for: ${decodedFilePath}, count: ${data.snapshots?.length || 0}`);
    } catch (e: any) {
      console.error(`[FileEditorPage] fetchSnapshots ERROR for: ${decodedFilePath}`, e);
      setSnapshotError(e.message || "An unexpected error occurred while fetching snapshots.");
      setServerSnapshots([]);
      setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }), 0);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [decodedFilePath, toast]);

  const fetchFileContent = useCallback(async () => {
    if (!decodedFilePath) {
      setError("File path is invalid or missing.");
      setIsLoading(false);
      return;
    }
    console.log(`[FileEditorPage] fetchFileContent called for: ${decodedFilePath}`);
    setIsLoading(true);
    setError(null);
    
    try {
      const settingsResult = await loadPanelSettings();
      if (settingsResult.status === 'success' && settingsResult.data) {
        setGlobalDebugModeActive(settingsResult.data.debugMode);
      } else {
        setGlobalDebugModeActive(false);
      }
    } catch (settingsError) {
      console.warn("[FileEditorPage] Error loading global panel settings for debug mode:", settingsError);
      setGlobalDebugModeActive(false);
    }
    
    const currentFileLanguage = getLanguageFromFilename(fileName);
    setEditorLanguage(currentFileLanguage);
    
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching file: ${response.statusText}`, details: `Path: ${decodedFilePath}` }));
        throw new Error(errData.error || errData.details || `Failed to fetch file content. Status: ${response.status}`);
      }
      const data = await response.json();
      if (typeof data.content !== 'string' || typeof data.writable !== 'boolean') {
        throw new Error("Invalid response format from server when fetching file content.");
      }
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      setIsWritable(data.writable);
      console.log(`[FileEditorPage] fetchFileContent SUCCESS for: ${decodedFilePath}, writable: ${data.writable}`);
      await fetchSnapshots(); 
    } catch (e: any) {
      console.error(`[FileEditorPage] fetchFileContent ERROR for: ${decodedFilePath}`, e);
      setError(e.message || "An unexpected error occurred while fetching file content.");
      setIsWritable(false); 
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, fetchSnapshots]);

  useEffect(() => {
    if (decodedFilePath) {
      fetchFileContent();
    } else if (encodedFilePathFromParams) {
      setError("Invalid file path parameter detected after decoding attempts.");
      setIsLoading(false);
    } else {
      setError("No file path provided in URL.");
      setIsLoading(false);
    }
  }, [decodedFilePath, encodedFilePathFromParams, fetchFileContent]);
  
  useEffect(() => {
    if (error) {
      setTimeout(() => toast({ title: "File Editor Error", description: error, variant: "destructive" }), 0);
    }
  }, [error, toast]);
  
  const handleCreateSnapshot = useCallback(async () => {
    if (!decodedFilePath) {
      setTimeout(() => toast({ title: "Error", description: "No active file to create snapshot for.", variant: "destructive" }), 0);
      return;
    }
    console.log(`[FileEditorPage] handleCreateSnapshot called for: ${decodedFilePath}, Lang: ${editorLanguage}`);
    setIsLoadingSnapshots(true); 
    setSnapshotError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: decodedFilePath, content: fileContent, language: editorLanguage }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to create snapshot.');
      }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${fileName} created.` }), 0);
      setServerSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []); 
      console.log(`[FileEditorPage] handleCreateSnapshot SUCCESS. New snapshot count: ${result.snapshots?.length || 0}`);
    } catch (e: any) {
      console.error(`[FileEditorPage] handleCreateSnapshot ERROR for: ${decodedFilePath}`, e);
      setTimeout(() => toast({ title: "Error Creating Snapshot", description: e.message, variant: "destructive" }), 0);
      setSnapshotError(e.message);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [decodedFilePath, fileContent, editorLanguage, fileName, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath) {
      setTimeout(() => toast({ title: "Error", description: "No active file to save.", variant: "destructive" }), 0);
      return;
    }
    if (!isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: "This file is not writable.", variant: "destructive" }), 0);
      return;
    }
    console.log(`[FileEditorPage] handleSaveChanges called for: ${decodedFilePath}`);

    if (hasUnsavedChanges) {
      await handleCreateSnapshot(); 
    }

    setIsSaving(true);
    setError(null); // Clear previous page-level errors
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: decodedFilePath, content: fileContent }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to save file.');
      }
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${fileName} saved.` }), 0);
      setOriginalFileContent(fileContent); 
      console.log(`[FileEditorPage] handleSaveChanges SUCCESS for: ${decodedFilePath}`);
    } catch (e: any) {
      console.error(`[FileEditorPage] handleSaveChanges ERROR for: ${decodedFilePath}`, e);
      setError(e.message || "An unexpected error occurred while saving."); // Set page-level error
      // Toast is handled by the useEffect watching 'error' state
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast, hasUnsavedChanges, handleCreateSnapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        const canSave = !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive);
        if (canSave) {
          handleSaveChanges();
        } else {
            if (globalDebugModeActive) console.log("[FileEditorPage] Ctrl+S: Save skipped.", {isSaving, isWritable, hasUnsavedChanges, globalDebugModeActive});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, isWritable, hasUnsavedChanges, handleSaveChanges, globalDebugModeActive]);

  const handleFind = useCallback(() => {
    if (editorRef.current && editorRef.current.view) {
       editorRef.current.view.dispatch({ effects: openSearchPanel.of() });
    } else {
       setTimeout(() => toast({
        title: "Find Action",
        description: "Editor not ready or no active editor instance. Use Ctrl+F (Cmd+F).",
      }),0);
    }
  }, [toast]);
  
  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
    if (snapshotToLoad) {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content); 
      setEditorLanguage(snapshotToLoad.language);
      setTimeout(() => toast({
        title: "Snapshot Loaded",
        description: `Loaded snapshot for ${fileName} from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}`,
      }),0);
    } else {
      setTimeout(() => toast({
        title: "Error",
        description: "Could not find the selected snapshot.",
        variant: "destructive",
      }),0);
    }
  }, [toast, fileName]);

  const handleToggleLockSnapshot = useCallback((snapshotId: string) => {
    // Placeholder: Server-side implementation needed for actual locking
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s));
    const snapshot = serverSnapshots.find(s => s.id === snapshotId);
    setTimeout(() => toast({ 
        title: snapshot?.isLocked ? "Snapshot Unlocked (Client)" : "Snapshot Locked (Client)", 
        description: "Server-side locking will be implemented later."
    }), 0);
  }, [toast, serverSnapshots]);

  const handleDeleteSnapshot = useCallback((snapshotIdToDelete: string) => {
     // Placeholder: Server-side implementation needed for actual deletion
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
    setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion will be implemented later."}), 0);
  }, [toast]);

  const handleViewSnapshotInPopup = (snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-var(--header-height,6rem)-2rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading file...</p>
      </div>
    );
  }

  if (error && !isLoading && !fileContent) { // Show general error if content couldn't be loaded at all
    return (
      <div className="p-4">
        <PageHeader title="Error Loading File" description={error} />
        <Button onClick={() => router.push('/files')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }

  if (!decodedFilePath && !isLoading) {
     return (
      <div className="p-4">
        <PageHeader title="Invalid File Path" description="The file path specified in the URL is invalid or missing." />
        <Button onClick={() => router.push('/files')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }

  const saveButtonDisabled = isSaving || !isWritable || (!hasUnsavedChanges && !globalDebugModeActive);
  const createSnapshotButtonDisabled = isLoadingSnapshots || (!globalDebugModeActive && !hasUnsavedChanges);


  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-var(--header-height,6rem)-2rem)]">
      <PageHeader
        title={`${fileName}`}
        description={<span className="font-mono text-xs break-all">{decodedFilePath}</span>}
        actions={
          <Button onClick={() => router.push('/files')} variant="outline" className="shadow-md hover:scale-105">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
          </Button>
        }
      />
      
      <>
        <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveChanges}
              disabled={saveButtonDisabled}
              className="shadow-sm hover:scale-105"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFind}
              className="shadow-sm hover:scale-105"
            >
              <SearchIcon className="mr-2 h-4 w-4" /> Find
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shadow-sm hover:scale-105"
                  disabled={isLoadingSnapshots}
                >
                  {isLoadingSnapshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Camera className="mr-2 h-4 w-4" />} Snapshots
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-96 max-w-[90vw]">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">
                  Server-side Snapshots (MAX_SERVER_SNAPSHOTS: {MAX_SERVER_SNAPSHOTS})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleCreateSnapshot}
                  disabled={createSnapshotButtonDisabled}
                >
                  Create Snapshot (Content & Lang)
                </DropdownMenuItem>

                {serverSnapshots.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs px-2">Recent Snapshots ({serverSnapshots.length})</DropdownMenuLabel>
                      {snapshotError && <DropdownMenuLabel className="text-xs px-2 text-destructive">{snapshotError}</DropdownMenuLabel>}
                      {serverSnapshots.map(snapshot => (
                        <DropdownMenuItem key={snapshot.id} className="flex justify-between items-center" onSelect={(e) => e.preventDefault()}>
                          <span onClick={() => handleLoadSnapshot(snapshot)} className="cursor-pointer flex-grow hover:text-primary text-xs truncate pr-2">
                            {format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}
                          </span>
                          <div className="flex items-center ml-1 gap-0.5 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View Snapshot">
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock Snapshot (Server)" : "Lock Snapshot (Server)"}>
                              {snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
                            </Button>
                             <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete Snapshot (Server)">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </>
                )}
                {serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError && (
                   <DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots yet.</DropdownMenuLabel>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 whitespace-normal">
                  (Server-side snapshots will expire after {MAX_SERVER_SNAPSHOTS} new ones are above that snapshot and it has been 3 weeks unless marked as locked)
                </DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mr-2">
            <span>{fileName}</span>
            <span className="mx-1">|</span>
            <span>Lang: {editorLanguage}</span>
            <span className="mx-1">|</span>
            <span>Chars: {fileContent.length}</span>
            <span className="mx-1">|</span>
            <span>Lines: {fileContent.split('\n').length}</span>
            {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">* Unsaved</span>}
            {!isWritable && <span className="ml-2 font-semibold text-destructive">(Read-only)</span>}
          </div>
        </div>

        {!isWritable && (
          <Alert variant="destructive" className="m-2 rounded-md flex-shrink-0">
            <FileWarning className="h-4 w-4" />
            <AlertTitle>Read-only Mode</AlertTitle>
            <AlertDescription>
              This file is not writable. Changes cannot be saved.
            </AlertDescription>
          </Alert>
        )}
        {error && fileContent && ( // Show specific save error if file content is loaded but save failed
            <Alert variant="destructive" className="m-2 rounded-md flex-shrink-0">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Save Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
        <div className="flex-grow relative p-0 bg-background min-h-0"> 
          <CodeEditor
            ref={editorRef}
            value={fileContent}
            onChange={setFileContent}
            language={editorLanguage}
            readOnly={isSaving || !isWritable}
            className="h-full w-full border-0 rounded-none" 
          />
        </div>
      </>
      {isSnapshotViewerOpen && selectedSnapshotForViewer && (
        <SnapshotViewerDialog
          isOpen={isSnapshotViewerOpen}
          onOpenChange={setIsSnapshotViewerOpen}
          snapshot={selectedSnapshotForViewer}
        />
      )}
    </div>
  );
}
