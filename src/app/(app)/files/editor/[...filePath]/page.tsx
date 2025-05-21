
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
  AlertTriangle,
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
import SnapshotViewerDialog from '../components/snapshot-viewer-dialog';

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
    case 'sh': case 'bash': return 'shell';
    default: return 'plaintext';
  }
}

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
function isImageExtension(filename: string): boolean {
  if (!filename) return false;
  const extension = path.extname(filename).toLowerCase();
  return imageExtensions.includes(extension);
}

export interface Snapshot {
  id: string;
  timestamp: string; // ISO string
  content: string;
  language: string;
  isLocked?: boolean;
}

const MAX_SERVER_SNAPSHOTS = 10; 

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
  
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
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
      console.error("[FileEditorPage] Failed to decode file path from params:", encodedFilePathFromParams, e);
      setError("Invalid file path in URL.");
      return '';
    }
  }, [encodedFilePathFromParams]);

  const fileName = useMemo(() => path.basename(decodedFilePath || 'Untitled'), [decodedFilePath]);
  const hasUnsavedChanges = useMemo(() => fileContent !== originalFileContent, [fileContent, originalFileContent]);

  useEffect(() => {
    if (error) {
      setTimeout(() => toast({ title: "File Editor Error", description: error, variant: "destructive" }), 0);
    }
  }, [error, toast]);

  const fetchSnapshots = useCallback(async () => {
    if (!decodedFilePath) return;
    if (globalDebugModeActive) console.log(`[FileEditorPage] fetchSnapshots called for: ${decodedFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(decodedFilePath)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching snapshots: ${response.statusText}`}));
        throw new Error(errData.error || errData.details || `Failed to fetch snapshots. Status: ${response.status}`);
      }
      let data;
      try {
        data = await response.json();
      } catch (jsonError: any) {
        if (globalDebugModeActive) console.error("[FileEditorPage] fetchSnapshots - JSON.parse error:", jsonError);
        // Check if the response body might be empty for non-existent snapshot files.
        if (response.headers.get('content-length') === '0' || jsonError.message.includes("Unexpected end of JSON input")) {
            data = { snapshots: [] }; // Assume empty snapshots if body is empty or parse fails this way
        } else {
            throw new Error("Failed to parse snapshots response from server. Response might not be valid JSON.");
        }
      }

      setServerSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
      if (globalDebugModeActive) console.log(`[FileEditorPage] fetchSnapshots SUCCESS for: ${decodedFilePath}, count: ${data.snapshots?.length || 0}`);
    } catch (e: any) {
      console.error(`[FileEditorPage] fetchSnapshots ERROR for: ${decodedFilePath}`, e);
      const errorMessage = e.message || "An unexpected error occurred while fetching snapshots.";
      setSnapshotError(errorMessage);
      setServerSnapshots([]);
      setTimeout(() => toast({ title: "Snapshot Error", description: errorMessage, variant: "destructive" }), 0);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [decodedFilePath, toast, globalDebugModeActive]);

  const fetchFileContent = useCallback(async () => {
    if (!decodedFilePath) {
      setError("File path is invalid or missing.");
      setIsLoading(false);
      return;
    }
    if (globalDebugModeActive) console.log(`[FileEditorPage] fetchFileContent called for: ${decodedFilePath}`);
    setIsLoading(true);
    setError(null);
    setSnapshotError(null); 
    setServerSnapshots([]);
    
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
    const isImage = isImageExtension(fileName);
    setIsImageFile(isImage);
    
    try {
      const response = await fetch(`/api/panel-daemon/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching file: ${response.statusText}`, details: `Path: ${decodedFilePath}` }));
        throw new Error(errData.error || errData.details || `Failed to fetch file content. Status: ${response.status}`);
      }
      let data;
      try {
        data = await response.json();
      } catch (jsonError: any) {
        if (globalDebugModeActive) console.error("[FileEditorPage] fetchFileContent - JSON.parse error:", jsonError);
        throw new Error("Failed to parse file content response from server. Response might be empty or not valid JSON.");
      }

      if (typeof data.writable !== 'boolean') {
        throw new Error("Invalid response format from server: missing 'writable' status.");
      }
      setIsWritable(data.writable);

      if (!isImage) { 
          if (typeof data.content !== 'string') {
            throw new Error("Invalid response format from server: missing 'content' for text file.");
          }
          setFileContent(data.content);
          setOriginalFileContent(data.content);
      }
      if (globalDebugModeActive) console.log(`[FileEditorPage] fetchFileContent SUCCESS for: ${decodedFilePath}, writable: ${data.writable}, isImage: ${isImage}`);
      if(!isImage) { // Only fetch snapshots for non-image files
        await fetchSnapshots(); 
      }
    } catch (e: any) {
      console.error(`[FileEditorPage] fetchFileContent ERROR for: ${decodedFilePath}`, e);
      setError(e.message || "An unexpected error occurred while fetching file content.");
      setIsWritable(false); 
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, fetchSnapshots, globalDebugModeActive]);

  useEffect(() => {
    if (!decodedFilePath && encodedFilePathFromParams) {
      setError("Invalid file path parameter detected after decoding attempts.");
      setIsLoading(false);
    } else if (decodedFilePath) {
      fetchFileContent();
    }
  }, [decodedFilePath, encodedFilePathFromParams, fetchFileContent]);
  
  const handleCreateSnapshot = useCallback(async () => {
    if (!decodedFilePath) {
      setTimeout(() => toast({ title: "Error", description: "No active file to create snapshot for.", variant: "destructive" }),0);
      return;
    }
    if (isImageFile) {
      setTimeout(() => toast({ title: "Info", description: "Snapshots are not supported for image files.", variant: "default" }),0);
      return;
    }
    if (globalDebugModeActive) console.log(`[FileEditorPage] handleCreateSnapshot called for: ${decodedFilePath}, Lang: ${editorLanguage}, Content Length: ${fileContent.length}`);
    setIsCreatingSnapshot(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: decodedFilePath, content: fileContent, language: editorLanguage }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to create snapshot from API.');
      }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${fileName} created.` }),0);
      setServerSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []); 
      if (globalDebugModeActive) console.log(`[FileEditorPage] handleCreateSnapshot SUCCESS. New snapshot count: ${result.snapshots?.length || 0}`);
    } catch (e: any) {
      console.error(`[FileEditorPage] handleCreateSnapshot ERROR for: ${decodedFilePath}`, e);
      const apiError = e.message || "An unexpected error occurred while creating the snapshot.";
       setTimeout(() => toast({ title: "Error Creating Snapshot", description: apiError, variant: "destructive" }),0);
      setSnapshotError(apiError);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [decodedFilePath, fileContent, editorLanguage, fileName, toast, isImageFile, globalDebugModeActive]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath) {
      setTimeout(() => toast({ title: "Error", description: "No active file to save.", variant: "destructive" }),0);
      return;
    }
    if (!isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: "This file is not writable.", variant: "destructive" }),0);
      return;
    }
    if (isImageFile) {
      setTimeout(() => toast({ title: "Cannot Save", description: "Direct saving of images from this editor is not supported.", variant: "destructive" }),0);
      return;
    }
    if (globalDebugModeActive) console.log(`[FileEditorPage] handleSaveChanges called for: ${decodedFilePath}`);

    if (hasUnsavedChanges) {
      await handleCreateSnapshot(); 
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: decodedFilePath, content: fileContent }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to save file.');
      }
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${fileName} saved.` }),0);
      setOriginalFileContent(fileContent); 
      if (globalDebugModeActive) console.log(`[FileEditorPage] handleSaveChanges SUCCESS for: ${decodedFilePath}`);
    } catch (e: any) {
      console.error(`[FileEditorPage] handleSaveChanges ERROR for: ${decodedFilePath}`, e);
      setError(e.message || "An unexpected error occurred while saving."); 
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast, hasUnsavedChanges, handleCreateSnapshot, isImageFile, globalDebugModeActive]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        const canSave = !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive) && !isImageFile;
        if (canSave) {
          handleSaveChanges();
        } else {
            if (globalDebugModeActive) console.log("[FileEditorPage] Ctrl+S: Save skipped.", {isSaving, isWritable, hasUnsavedChanges, globalDebugModeActive, isImageFile});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, isWritable, hasUnsavedChanges, handleSaveChanges, globalDebugModeActive, isImageFile]);

  const handleFind = useCallback(() => {
    if (isImageFile) return;
    if (editorRef.current && editorRef.current.view) {
       setTimeout(() => editorRef.current!.view!.dispatch({ effects: openSearchPanel.of() }), 0);
    } else {
       setTimeout(() => toast({
        title: "Find Action",
        description: "Editor not ready or no active editor instance. Use Ctrl+F (Cmd+F).",
      }),0);
    }
  }, [toast, isImageFile]);
  
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

  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    // Placeholder: Will integrate with backend API for locking later
    setServerSnapshots(prev => 
        prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s)
    );
    const snapshot = serverSnapshots.find(s => s.id === snapshotId);
    setTimeout(() => toast({ 
        title: snapshot?.isLocked ? "Snapshot Unlocked (Client Only)" : "Snapshot Locked (Client Only)", 
        description: "Server-side locking will be implemented later."
    }), 0);
  }, [toast, serverSnapshots]);

  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
     // Placeholder: Will integrate with backend API for deletion later
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
    setTimeout(() => toast({ title: "Snapshot Deleted (Client Only)", description: "Server-side deletion will be implemented later."}), 0);
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

  if (error && !fileContent && !isImageFile) { 
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

  const saveButtonDisabled = isSaving || !isWritable || (!hasUnsavedChanges && !globalDebugModeActive) || isImageFile;
  const createSnapshotButtonDisabled = isCreatingSnapshot || isLoadingSnapshots || isImageFile || (!globalDebugModeActive && !hasUnsavedChanges);


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
            {!isImageFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFind}
                className="shadow-sm hover:scale-105"
              >
                <SearchIcon className="mr-2 h-4 w-4" /> Find
              </Button>
            )}
            {!isImageFile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shadow-sm hover:scale-105"
                  disabled={isLoadingSnapshots || isImageFile}
                >
                  {isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Camera className="mr-2 h-4 w-4" />} Snapshots
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-96 max-w-[90vw]">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">
                  Server-side Snapshots (Max: {MAX_SERVER_SNAPSHOTS})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleCreateSnapshot}
                  disabled={createSnapshotButtonDisabled}
                >
                  {isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
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
                {serverSnapshots.length === 0 && !isLoadingSnapshots && !isCreatingSnapshot && !snapshotError && (
                   <DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots yet.</DropdownMenuLabel>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 whitespace-normal">
                  Snapshots are stored on the server. Locked snapshots are less likely to be auto-pruned.
                </DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mr-2">
            <span>{fileName}</span>
            {!isImageFile && (
              <>
                <span className="mx-1">|</span>
                <span>Lang: {editorLanguage}</span>
                <span className="mx-1">|</span>
                <span>Chars: {fileContent.length}</span>
                <span className="mx-1">|</span>
                <span>Lines: {fileContent.split('\n').length}</span>
                {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">* Unsaved</span>}
              </>
            )}
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
        {error && (fileContent || isImageFile) && ( 
            <Alert variant="destructive" className="m-2 rounded-md flex-shrink-0">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>File Operation Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
        {snapshotError && !isImageFile && (
           <Alert variant="destructive" className="m-2 rounded-md flex-shrink-0">
                <Camera className="h-4 w-4"/>
                <AlertTitle>Snapshot Operation Error</AlertTitle>
                <AlertDescription>{snapshotError}</AlertDescription>
            </Alert>
        )}
        <div className="flex-grow relative p-0 bg-background min-h-0"> 
          {isImageFile ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              {isLoading ? (
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              ) : error ? (
                <div className="text-destructive text-center">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
                  <p>Error loading image: {error}</p>
                </div>
              ) : (
                <Image
                  src={`/api/panel-daemon/file?path=${encodeURIComponent(decodedFilePath)}`}
                  alt={`Preview of ${fileName}`}
                  fill
                  style={{ objectFit: 'contain' }} 
                  unoptimized 
                  data-ai-hint="file preview"
                  onError={(e) => {
                    console.error("Image load error in editor:", e);
                    setError("Failed to load image resource for preview.");
                  }}
                />
              )}
            </div>
          ) : (
            <CodeEditor
              ref={editorRef}
              value={fileContent}
              onChange={setFileContent}
              language={editorLanguage}
              readOnly={isSaving || !isWritable}
              className="h-full w-full border-0 rounded-none" 
            />
          )}
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

