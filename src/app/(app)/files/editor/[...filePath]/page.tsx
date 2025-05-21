
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ArrowLeft, Camera, Search as SearchIcon, FileWarning } from "lucide-react";
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
    case 'yaml': case 'yml': return 'yaml'; // Added yaml/yml
    case 'md': return 'markdown';
    case 'sh': case 'bash': return 'shell';
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
  language: string; // Added language to snapshot
}

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
  const [isImage, setIsImage] = useState<boolean>(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

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
  const fileLanguage = useMemo(() => getLanguageFromFilename(fileName), [fileName]);
  const [editorLanguage, setEditorLanguage] = useState<string>(fileLanguage); // State for current editor language

  useEffect(() => {
    setEditorLanguage(getLanguageFromFilename(fileName));
  }, [fileName]);

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
    setIsImage(isImageExtension(fileName));

    try {
      const settingsResult = await loadPanelSettings();
      if (settingsResult.data) {
        setGlobalDebugModeActive(settingsResult.data.debugMode);
      }
    } catch (settingsError) {
      console.warn("Could not load panel settings for debug mode status:", settingsError);
    }

    if (isImageExtension(fileName)) {
      // For images, we'll set the src directly for the <img> tag
      // and fetch metadata separately to check writability (if needed for UI elements)
      setImageSrc(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}`);
       try {
            const metaResponse = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
            if (!metaResponse.ok) {
                 // Non-critical error for image viewing if metadata fails but image might still load
                console.warn(`Failed to fetch metadata for image ${fileName}. Status: ${metaResponse.status}`);
                setIsWritable(false); // Assume not writable if metadata fails
            } else {
                const metaData = await metaResponse.json();
                setIsWritable(metaData.writable);
            }
        } catch (e) {
            console.warn(`Error fetching metadata for image ${fileName}:`, e);
            setIsWritable(false);
        }
      setIsLoading(false); // Image loading itself is handled by the <img> tag
      return;
    }

    // For non-image files
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching file: ${response.statusText}`, details: `Path: ${decodedFilePath}` }));
        throw new Error(errData.error || `Failed to fetch file content. Status: ${response.status}`);
      }
      const data = await response.json();
      if (typeof data.content !== 'string' || typeof data.writable !== 'boolean') {
        throw new Error("Invalid response format from server when fetching file content.");
      }
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      setEditorLanguage(getLanguageFromFilename(fileName)); // Set editor language based on fetched file
      setIsWritable(data.writable);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while fetching file content.");
      toast({ title: "Error Loading File", description: e.message, variant: "destructive" });
      setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, toast]);

  useEffect(() => {
    if (decodedFilePath) {
      fetchFileContent();
    } else if (encodedFilePathFromParams) {
      setIsLoading(false);
      setError("Invalid file path parameter.");
      toast({title: "Error", description: "Invalid file path provided in URL.", variant: "destructive"});
    } else {
      setIsLoading(false);
      setError("No file path provided in URL.");
    }
  }, [decodedFilePath, encodedFilePathFromParams, fetchFileContent, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath) {
      toast({ title: "Error", description: "No active file to save.", variant: "destructive" });
      return;
    }
    if (!isWritable) {
      toast({ title: "Cannot Save", description: "This file is not writable.", variant: "destructive" });
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
      toast({ title: 'Success', description: result.message || `File ${fileName} saved.` });
      setOriginalFileContent(fileContent);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
      toast({ title: "Error Saving File", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast]);

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
      editorRef.current.view.dispatch({ effects: openSearchPanel.of() });
    } else {
      toast({
        title: "Find Action",
        description: "Editor not ready or no active editor instance. Use Ctrl+F (Cmd+F).",
      });
    }
  }, [toast]);

  const handleCreateSnapshot = useCallback(() => {
    const newSnapshot: Snapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      content: fileContent,
      language: editorLanguage, // Store current editor language
    };
    setSnapshots(prevSnapshots => [newSnapshot, ...prevSnapshots].slice(0,10)); // Keep up to 10 client-side snapshots
    console.log("[FileEditorPage] CLIENT-SIDE SNAPSHOT CREATED:", { id: newSnapshot.id, timestamp: newSnapshot.timestamp, lang: newSnapshot.language });
    toast({
      title: "Snapshot Created (Client-side)",
      description: `Created snapshot at ${format(new Date(newSnapshot.timestamp), 'HH:mm:ss')}. This snapshot is temporary and will be lost on refresh.`,
    });
  }, [fileContent, editorLanguage, toast]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = snapshots.find(s => s.id === snapshotId);
    if (snapshotToLoad) {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content); // Treat loaded snapshot as the new original
      setEditorLanguage(snapshotToLoad.language); // Restore language
      console.log("[FileEditorPage] CLIENT-SIDE SNAPSHOT LOADED:", { id: snapshotToLoad.id, timestamp: snapshotToLoad.timestamp, lang: snapshotToLoad.language });
      toast({
        title: "Snapshot Loaded",
        description: `Loaded snapshot from ${format(new Date(snapshotToLoad.timestamp), 'PPpp HH:mm:ss')}`,
      });
    } else {
      toast({
        title: "Error",
        description: "Could not find the selected snapshot.",
        variant: "destructive",
      });
    }
  }, [snapshots, toast]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-var(--header-height,6rem)-2rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading file...</p>
      </div>
    );
  }
  
  if (error && !isImage) { // Only show general error if not an image with its own error handling
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
      
      {isImage ? (
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
              onError={() => setImageError('Failed to load image resource.')} 
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-primary" /> // Shown while imageSrc might be loading initially if not immediate
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
                <DropdownMenuContent align="start" className="w-72">
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
                        <DropdownMenuLabel className="text-xs px-2">Recent Snapshots ({snapshots.length})</DropdownMenuLabel>
                        {snapshots.map(snapshot => (
                          <DropdownMenuItem key={snapshot.id} onSelect={() => handleLoadSnapshot(snapshot.id)}>
                            Load: {format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}
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
            <Alert variant="destructive" className="m-2 rounded-md">
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
    </div>
  );
}

    