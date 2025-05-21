
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
  Eye 
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
import SnapshotViewerDialog from './components/snapshot-viewer-dialog';

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
    // case 'sh': case 'bash': // Shell support removed due to npm install issues for @codemirror/lang-shell
    //   return 'shell';
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
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  
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
    setImageError(null);
    const currentIsImage = isImageExtension(fileName);
    setIsImageFile(currentIsImage);
    setEditorLanguage(getLanguageFromFilename(fileName));

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

    if (currentIsImage) {
      setImageSrc(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}`);
       try {
            const metaResponse = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
            if (!metaResponse.ok) {
                const errData = await metaResponse.json().catch(() => ({ error: `Failed to fetch metadata for image. Status: ${metaResponse.status}` }));
                console.warn(`Failed to fetch metadata for image ${fileName}: ${errData.error}`);
                setImageError(errData.error || `Failed to fetch metadata for image ${fileName}.`);
                setIsWritable(false); 
            } else {
                const metaData = await metaResponse.json();
                setIsWritable(metaData.writable);
            }
        } catch (e: any) {
            console.warn(`Error fetching metadata for image ${fileName}:`, e);
            setImageError(e.message || "An unexpected error occurred while fetching image metadata.");
            setIsWritable(false);
        }
      setIsLoading(false);
      return;
    }

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
      setIsLoading(false);
      setError("Invalid file path parameter.");
    } else {
      setIsLoading(false);
      setError("No file path provided in URL.");
    }
  }, [decodedFilePath, encodedFilePathFromParams, fetchFileContent]);

  useEffect(() => {
    if (error) {
      toast({ title: "File Editor Error", description: error, variant: "destructive" });
    }
  }, [error, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath) {
      setTimeout(() => toast({ title: "Error", description: "No active file to save.", variant: "destructive" }), 0);
      return;
    }
    if (!isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: "This file is not writable.", variant: "destructive" }), 0);
      return;
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
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${fileName} saved.` }), 0);
      setOriginalFileContent(fileContent);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast, DAEMON_API_BASE_PATH]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (!isSaving && isWritable && hasUnsavedChanges) {
          handleSaveChanges();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, isWritable, hasUnsavedChanges, handleSaveChanges]);

  const handleFind = useCallback(() => {
    if (editorRef.current && editorRef.current.view) {
      openSearchPanel(editorRef.current.view);
    } else {
      setTimeout(() => toast({
        title: "Find Action",
        description: "Editor not ready or no active editor instance. Use Ctrl+F (Cmd+F).",
      }),0);
    }
  }, [toast]);

  const handleCreateSnapshot = useCallback(() => {
    setSnapshots(prevSnapshots => {
      let updatedSnapshots = [...prevSnapshots];
      if (updatedSnapshots.length >= MAX_SNAPSHOTS) {
        const oldestUnlockedIndex = updatedSnapshots.slice().reverse().findIndex(s => !s.isLocked);
        if (oldestUnlockedIndex !== -1) {
          const actualIndexToRemove = updatedSnapshots.length - 1 - oldestUnlockedIndex;
          updatedSnapshots.splice(actualIndexToRemove, 1);
        } else {
          setTimeout(() => toast({
            title: "Snapshot Limit Reached",
            description: `Cannot create new snapshot. All ${MAX_SNAPSHOTS} snapshot slots are locked.`,
            variant: "destructive",
            duration: 7000,
          }),0);
          return prevSnapshots;
        }
      }

      const newSnapshot: Snapshot = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        content: fileContent,
        language: editorLanguage,
        isLocked: false,
      };
      console.log("[FileEditorPage] CLIENT-SIDE SNAPSHOT CREATED:", { id: newSnapshot.id, timestamp: newSnapshot.timestamp, lang: newSnapshot.language, locked: newSnapshot.isLocked });
      setTimeout(() => toast({
        title: "Snapshot Created (Client-side)",
        description: `Created snapshot at ${format(new Date(newSnapshot.timestamp), 'HH:mm:ss')}. This snapshot is temporary.`,
      }),0);
      return [newSnapshot, ...updatedSnapshots];
    });
  }, [fileContent, editorLanguage, toast]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = snapshots.find(s => s.id === snapshotId);
    if (snapshotToLoad) {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content); 
      setEditorLanguage(snapshotToLoad.language);
      console.log("[FileEditorPage] CLIENT-SIDE SNAPSHOT LOADED:", { id: snapshotToLoad.id, timestamp: snapshotToLoad.timestamp, lang: snapshotToLoad.language });
      setTimeout(() => toast({
        title: "Snapshot Loaded",
        description: `Loaded snapshot from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}`,
      }),0);
    } else {
      setTimeout(() => toast({
        title: "Error",
        description: "Could not find the selected snapshot.",
        variant: "destructive",
      }),0);
    }
  }, [snapshots, toast]);

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
  
  if (error && !isImageFile && !isLoading) {
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
        <div className="flex-grow flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          {imageError ? (
            <Alert variant="destructive">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Error Loading Image</AlertTitle>
              <AlertDescription>{imageError}</AlertDescription>
            </Alert>
          ) : imageSrc ? (
            <img 
              src={imageSrc} 
              alt={fileName} 
              className="max-w-full max-h-full object-contain rounded-md shadow-lg" 
              onError={() => {
                setImageError('Failed to load image resource.');
              }}
            />
          ) : (
             <Loader2 className="h-8 w-8 animate-spin text-primary" /> 
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
                disabled={isSaving || !isWritable || !hasUnsavedChanges} 
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
                <DropdownMenuContent align="start" className="w-80">
                  <DropdownMenuLabel className="text-xs text-muted-foreground px-2">
                    Client-side Snapshots (lost on refresh)
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
                            <span onClick={() => handleLoadSnapshot(snapshot.id)} className="cursor-pointer flex-grow hover:text-primary text-xs">
                              {format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}
                            </span>
                            <div className="flex items-center ml-2 gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)}>
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)}>
                                {snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
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

