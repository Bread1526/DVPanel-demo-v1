
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
    // case 'sh': case 'bash': return 'shell'; // Shell support removed
    case 'py': return 'python';
    default: return 'plaintext';
  }
}

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
function isImageExtension(filename: string): boolean {
  if (!filename) return false;
  const extension = path.extname(filename).toLowerCase();
  return imageExtensions.includes(extension);
}

interface Snapshot {
  id: string;
  timestamp: string; // ISO string
  content: string;
  language: string;
  isLocked?: boolean;
}

const MAX_SNAPSHOTS = 10;

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
  const [isImageFile, setIsImageFile] = useState<boolean>(false);

  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [editorLanguage, setEditorLanguage] = useState<string>('plaintext');

  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  const encodedFilePathFromParams = params.filePath;

  const decodedFilePath = useMemo(() => {
    const pathArray = Array.isArray(encodedFilePathFromParams) ? encodedFilePathFromParams : [encodedFilePathFromParams].filter(Boolean);
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

  const DAEMON_API_BASE_PATH = '/api/panel-daemon';

  const fetchFileContent = useCallback(async () => {
    if (!decodedFilePath) {
      setError("File path is invalid or missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const currentFileLanguage = getLanguageFromFilename(fileName);
    setEditorLanguage(currentFileLanguage);

    try {
      const settingsResult = await loadPanelSettings();
      if (settingsResult.status === 'success' && settingsResult.data) {
        setGlobalDebugModeActive(settingsResult.data.debugMode);
      } else {
        console.warn("Could not load panel settings for debug mode status, using default false.");
        setGlobalDebugModeActive(false);
      }
    } catch (settingsError) {
      console.warn("Error loading panel settings for debug mode status:", settingsError);
      setGlobalDebugModeActive(false);
    }
    
    if (isImageExtension(fileName)) {
      setIsImageFile(true);
      // Still fetch metadata like writability for images
      try {
        const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: `Error fetching image metadata: ${response.statusText}`, details: `Path: ${decodedFilePath}` }));
          throw new Error(errData.error || errData.details || `Failed to fetch image metadata. Status: ${response.status}`);
        }
        const data = await response.json();
        setIsWritable(data.writable);
      } catch (e: any) {
        setError(e.message || "An unexpected error occurred while fetching image metadata.");
        setIsWritable(false); // Assume not writable on error
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    setIsImageFile(false);
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
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while fetching file content.");
      setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, DAEMON_API_BASE_PATH]);


  useEffect(() => {
    if (decodedFilePath) {
      fetchFileContent();
    } else if (encodedFilePathFromParams) {
      setError("Invalid file path parameter.");
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

  const handleCreateSnapshot = useCallback(() => {
    setSnapshots(prevSnapshots => {
      let updatedSnapshots = [...prevSnapshots];
      if (updatedSnapshots.length >= MAX_SNAPSHOTS) {
        let oldestUnlockedIndex = -1;
        // Try to find oldest unlocked from the end (most recent first)
        for (let i = updatedSnapshots.length - 1; i >= 0; i--) {
          if (!updatedSnapshots[i].isLocked) {
            oldestUnlockedIndex = i;
            // No break, we want the *oldest* among the unlocked ones if we iterate from end
          }
        }
        // If all are locked or no unlocked found from end, try from the start
        if (oldestUnlockedIndex === -1) {
            for (let i = 0; i < updatedSnapshots.length; i++) {
                if (!updatedSnapshots[i].isLocked) {
                    oldestUnlockedIndex = i;
                    break; 
                }
            }
        }

        if (oldestUnlockedIndex !== -1) {
          updatedSnapshots.splice(oldestUnlockedIndex, 1);
        } else {
          setTimeout(() => toast({
            title: "Snapshot Limit Reached",
            description: `Cannot create new snapshot. All ${MAX_SNAPSHOTS} snapshot slots are locked. Unlock some or delete manually.`,
            variant: "destructive",
            duration: 7000,
          }),0);
          return prevSnapshots; // Return original snapshots if limit reached and all are locked
        }
      }

      const newSnapshot: Snapshot = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        content: fileContent,
        language: editorLanguage,
        isLocked: false,
      };
      if (globalDebugModeActive) {
          console.log("[FileEditorPage] CLIENT-SIDE SNAPSHOT CREATED:", { id: newSnapshot.id, timestamp: newSnapshot.timestamp, lang: newSnapshot.language, locked: newSnapshot.isLocked });
      }
      setTimeout(() => toast({
        title: "Snapshot Created (Client-side)",
        description: `Created snapshot for ${fileName} at ${format(new Date(newSnapshot.timestamp), 'HH:mm:ss')}. Lang: ${newSnapshot.language}`,
      }),0);
      return [newSnapshot, ...updatedSnapshots]; // Prepend new snapshot
    });
  }, [fileContent, editorLanguage, toast, fileName, globalDebugModeActive]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath) {
      setTimeout(() => toast({ title: "Error", description: "No active file to save.", variant: "destructive" }),0);
      return;
    }
    if (!isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: "This file is not writable.", variant: "destructive" }),0);
      return;
    }

    if (hasUnsavedChanges) { // Only create snapshot if actual changes exist
      handleCreateSnapshot(); 
    }

    setIsSaving(true);
    setError(null);
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
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${fileName} saved.` }),0);
      setOriginalFileContent(fileContent); // Update original content after successful save
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
      setTimeout(() => toast({ title: "Error Saving File", description: e.message, variant: "destructive" }),0);
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast, DAEMON_API_BASE_PATH, hasUnsavedChanges, handleCreateSnapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        const canSave = !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive);
        if (canSave) {
          handleSaveChanges();
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
  
  useEffect(() => {
    // This effect is just to ensure handleSaveChanges is re-memoized if handleCreateSnapshot changes
  }, [handleCreateSnapshot]);


  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = snapshots.find(s => s.id === snapshotId);
    if (snapshotToLoad) {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content); 
      setEditorLanguage(snapshotToLoad.language);
      if (globalDebugModeActive) {
          console.log("[FileEditorPage] CLIENT-SIDE SNAPSHOT LOADED:", { id: snapshotToLoad.id, timestamp: snapshotToLoad.timestamp, lang: snapshotToLoad.language });
      }
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
  }, [snapshots, toast, fileName, globalDebugModeActive]);

  const handleToggleLockSnapshot = useCallback((snapshotId: string) => {
    setSnapshots(prevSnapshots => {
      const updatedSnapshots = prevSnapshots.map(s =>
        s.id === snapshotId ? { ...s, isLocked: !s.isLocked } : s
      );
      const updatedSnapshot = updatedSnapshots.find(s => s.id === snapshotId);
      if (updatedSnapshot) {
        setTimeout(() => toast({
          title: `Snapshot ${updatedSnapshot.isLocked ? "Locked" : "Unlocked"}`,
          description: `Snapshot from ${format(new Date(updatedSnapshot.timestamp), 'HH:mm:ss')} is now ${updatedSnapshot.isLocked ? "locked" : "unlocked"}.`,
        }),0);
      }
      return updatedSnapshots;
    });
  }, [toast]);

  const handleDeleteSnapshot = useCallback((snapshotIdToDelete: string) => {
    setSnapshots(prevSnapshots => {
      const updatedSnapshots = prevSnapshots.filter(s => s.id !== snapshotIdToDelete);
      setTimeout(() => toast({
        title: "Snapshot Deleted",
        description: `Client-side snapshot removed.`,
      }),0);
      return updatedSnapshots;
    });
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

  if (error && !isLoading && !isImageFile) { 
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
      
      {isImageFile ? (
        <div className="flex-grow flex items-center justify-center p-4 bg-muted/30 rounded-lg">
          {error && ( 
            <Alert variant="destructive" className="max-w-md">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Error Loading Image Metadata</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!error && decodedFilePath && (
            <Image
              src={`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}`}
              alt={`Image preview for ${fileName}`}
              width={800} 
              height={600}
              style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: 'calc(100vh - 200px)' }} 
              className="rounded-md shadow-lg"
              unoptimized 
              data-ai-hint="image preview"
            />
          )}
        </div>
      ) : (
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
                  >
                    <Camera className="mr-2 h-4 w-4" /> Snapshots
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-96">
                  <DropdownMenuLabel className="text-xs text-muted-foreground px-2">
                    Client-side Snapshots (temporary)
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={handleCreateSnapshot}
                    disabled={!(globalDebugModeActive || hasUnsavedChanges)}
                  >
                    Create Snapshot (Content & Lang)
                  </DropdownMenuItem>

                  {snapshots.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs px-2">Recent Snapshots ({snapshots.length} / {MAX_SNAPSHOTS})</DropdownMenuLabel>
                        {snapshots.map(snapshot => (
                          <DropdownMenuItem key={snapshot.id} className="flex justify-between items-center" onSelect={(e) => e.preventDefault()}>
                            <span onClick={() => handleLoadSnapshot(snapshot.id)} className="cursor-pointer flex-grow hover:text-primary text-xs truncate pr-2">
                              {format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}
                            </span>
                            <div className="flex items-center ml-1 gap-0.5 flex-shrink-0">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View Snapshot">
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}>
                                {snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
                              </Button>
                               <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete Snapshot">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </>
                  )}
                  {snapshots.length === 0 && (
                     <DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots yet.</DropdownMenuLabel>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground px-2 whitespace-normal">
                    (Server-side snapshots will expire after 3 new ones are above that snapshot and it has been 3 weeks unless marked as locked)
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
      )}
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
