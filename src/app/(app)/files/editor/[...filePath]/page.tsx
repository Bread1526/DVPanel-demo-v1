
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
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import path from 'path-browserify';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

import { SearchCursor } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  timestamp: string;
  content: string;
  language: string;
  isLocked?: boolean;
}

const MAX_SERVER_SNAPSHOTS = 10;
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];

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

  // State for custom find dialog
  const [isFindDialogOpen, setIsFindDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

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
    if (error && !isImageFile) {
       setTimeout(() => toast({ title: "File Editor Error", description: error, variant: "destructive" }), 0);
    }
  }, [error, toast, isImageFile]);
  
  useEffect(() => {
    if (snapshotError) {
        setTimeout(() => toast({ title: "Snapshot Error", description: snapshotError, variant: "destructive" }), 0);
    }
  }, [snapshotError, toast]);

  const fetchSnapshots = useCallback(async () => {
    if (!decodedFilePath || isImageFile) return;
    if (globalDebugModeActive) console.log(`[FileEditorPage] fetchSnapshots CALLED for: ${decodedFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(decodedFilePath)}`);
      if (!response.ok) {
        let errData;
        let errorText = `Failed to fetch snapshots. Status: ${response.status}`;
        try {
          errData = await response.json();
          errorText = errData.error || errData.details || errorText;
        } catch (e) {
          const rawText = await response.text().catch(() => "Could not read error response.");
          errorText = `${errorText}. Server response: ${rawText}`;
        }
        throw new Error(errorText);
      }
      const data = await response.json();
      if (data && Array.isArray(data.snapshots)) {
        setServerSnapshots(data.snapshots);
      } else {
        setServerSnapshots([]);
      }
    } catch (e: any) {
      const errorMessage = e.message || "An unexpected error occurred while fetching snapshots.";
      setSnapshotError(errorMessage);
      setServerSnapshots([]);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [decodedFilePath, globalDebugModeActive, isImageFile]);

  const fetchFileContent = useCallback(async () => {
    if (!decodedFilePath) {
      setError("File path is invalid or missing.");
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setSnapshotError(null);
    setServerSnapshots([]);
    
    let currentGlobalDebug = false;
    try {
      const settingsResult = await loadPanelSettings();
      if (settingsResult.status === 'success' && settingsResult.data) {
        setGlobalDebugModeActive(settingsResult.data.debugMode);
        currentGlobalDebug = settingsResult.data.debugMode;
      } else {
        setGlobalDebugModeActive(false);
      }
    } catch (settingsError) {
      setGlobalDebugModeActive(false);
    }
    if (currentGlobalDebug) console.log(`[FileEditorPage] fetchFileContent CALLED for: ${decodedFilePath}. Global debug mode: ${currentGlobalDebug}`);
    
    const currentFileLang = getLanguageFromFilename(fileName);
    setEditorLanguage(currentFileLang);
    const isImage = isImageExtension(fileName);
    setIsImageFile(isImage);
    
    try {
      const response = await fetch(`/api/panel-daemon/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
      let data;
      if (!response.ok) {
        try {
            data = await response.json();
            throw new Error(data.error || data.details || `Failed to fetch file. Status: ${response.status}`);
        } catch (e) {
             const textError = await response.text();
             throw new Error(`Failed to fetch file. Status: ${response.status}. Response: ${textError || "Empty response"}`);
        }
      }
      try {
        data = await response.json();
      } catch (jsonError: any) {
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
      } else {
          setFileContent(''); 
          setOriginalFileContent('');
      }
      
      if(!isImage) {
        await fetchSnapshots(); 
      }

    } catch (e: any)      {
        setError(e.message || "An unexpected error occurred while fetching file content.");
        setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, fetchSnapshots]);

  useEffect(() => {
    if (!decodedFilePath && encodedFilePathFromParams) {
      setError("Invalid file path parameter detected after decoding attempts.");
      setIsLoading(false);
    } else if (decodedFilePath) {
      fetchFileContent();
    }
  }, [decodedFilePath, encodedFilePathFromParams, fetchFileContent]);
  
  const handleCreateSnapshot = useCallback(async () => {
    if (!decodedFilePath || isImageFile) {
      setTimeout(() => toast({ title: isImageFile ? "Info" : "Error", description: isImageFile ? "Snapshots are not supported for image files." : "No active file to create snapshot for.", variant: isImageFile ? "default" : "destructive" }),0);
      return;
    }
    if (globalDebugModeActive) console.log(`[FileEditorPage] handleCreateSnapshot CALLED for: ${decodedFilePath}, Lang: ${editorLanguage}, Content Length: ${fileContent.length}`);
    setIsCreatingSnapshot(true);
    setSnapshotError(null);

    const snapshotData = { filePath: decodedFilePath, content: fileContent, language: editorLanguage };

    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshotData),
      });
      
      let resultText = await response.text();
      if (globalDebugModeActive) console.log("[FileEditorPage] handleCreateSnapshot: API Response Status:", response.status, "Body:", resultText);

      if (!response.ok) {
        let errorMsg = `API Error: ${response.status}. ${resultText}`;
        try {
          const jsonError = JSON.parse(resultText);
          errorMsg = jsonError.error || jsonError.details || errorMsg;
        } catch (e) { /* ignore if not JSON */ }
        throw new Error(errorMsg);
      }
      
      const result = JSON.parse(resultText);

      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${fileName} created.` }),0);
      
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots);
      } else {
        await fetchSnapshots();
      }
    } catch (e: any) {
      const apiErrorMsg = e.message || "An unexpected error occurred while creating the snapshot.";
      if (globalDebugModeActive) console.error("[FileEditorPage] handleCreateSnapshot API Error:", e);
      setSnapshotError(apiErrorMsg);
      setTimeout(() => toast({ title: 'Snapshot Error', description: apiErrorMsg, variant: 'destructive' }),0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [decodedFilePath, fileContent, editorLanguage, fileName, toast, isImageFile, globalDebugModeActive, fetchSnapshots]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath || !isWritable || isImageFile) {
      setTimeout(() => toast({ title: "Cannot Save", description: !decodedFilePath ? "No active file." : !isWritable ? "File not writable." : "Image saving not supported here.", variant: "destructive" }),0);
      return;
    }

    if (hasUnsavedChanges) { // Only create snapshot if there are actual changes
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
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
      setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive"}),0);
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast, hasUnsavedChanges, handleCreateSnapshot, isImageFile, globalDebugModeActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const canSave = !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive) && !isImageFile;
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (canSave) {
          handleSaveChanges();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, isWritable, hasUnsavedChanges, handleSaveChanges, globalDebugModeActive, isImageFile]);

  const performSearch = useCallback((query: string) => {
    if (!editorRef.current?.view || !query) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      if (query && editorRef.current?.view) {
        setTimeout(() => toast({ title: "Not Found", description: `"${query}" was not found in the file.`, duration: 3000 }),0);
      }
      return;
    }
    const view = editorRef.current.view;
    const cursor = new SearchCursor(view.state.doc, query);
    const matches: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) {
      matches.push({ from: cursor.value.from, to: cursor.value.to });
    }

    setSearchMatches(matches);
    if (matches.length > 0) {
      setCurrentMatchIndex(0);
      view.dispatch({
        selection: EditorSelection.single(matches[0].from, matches[0].to),
        effects: EditorView.scrollIntoView(matches[0].from, { y: "center" }),
      });
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${query}" was not found in the file.`, duration: 3000 }),0);
    }
  }, [toast]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
       setTimeout(() => toast({ title: "Empty Search", description: "Please enter text to search.", duration: 3000 }),0);
      return;
    }
    performSearch(searchQuery);
  };
  
  const handlePresetSearch = (term: string) => {
    setSearchQuery(term);
    performSearch(term);
  };

  const goToMatch = useCallback((index: number) => {
    if (editorRef.current?.view && searchMatches[index]) {
      const match = searchMatches[index];
      editorRef.current.view.dispatch({
        selection: EditorSelection.single(match.from, match.to),
        effects: EditorView.scrollIntoView(match.from, { y: "center" }),
      });
      setCurrentMatchIndex(index);
    }
  }, [searchMatches]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    goToMatch(nextIndex);
  }, [currentMatchIndex, searchMatches, goToMatch]);

  const handlePreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    goToMatch(prevIndex);
  }, [currentMatchIndex, searchMatches, goToMatch]);
  
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
    const snapshotIndex = serverSnapshots.findIndex(s => s.id === snapshotId);
    if (snapshotIndex === -1) {
      setSnapshotError("Snapshot not found to toggle lock.");
       setTimeout(() => toast({ title: "Snapshot Error", description: "Snapshot not found to toggle lock.", variant: "destructive"}),0);
      return;
    }
    
    const updatedSnapshot = { ...serverSnapshots[snapshotIndex], isLocked: !serverSnapshots[snapshotIndex].isLocked };
    const updatedSnapshots = [...serverSnapshots];
    updatedSnapshots[snapshotIndex] = updatedSnapshot;
    setServerSnapshots(updatedSnapshots);

    setTimeout(() => toast({ 
        title: updatedSnapshot.isLocked ? "Snapshot Locked (Client)" : "Snapshot Unlocked (Client)", 
        description: "Server-side lock persistence is pending API implementation."
    }), 0);
    // TODO: Implement API call to persist lock state on server
  }, [serverSnapshots, toast]);

  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
    setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion is pending API implementation."}), 0);
    // TODO: Implement API call to delete snapshot on server
  }, [toast]);

  const handleViewSnapshotInPopup = (snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };

  useEffect(() => {
    if (!isFindDialogOpen) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [isFindDialogOpen]);

  useEffect(() => {
    // New effect to show error toasts from `setError` calls
    if (error && !isLoading && !isImageFile) { // Avoid showing toast if loading or if it's an image loading error (handled separately)
        setTimeout(() => toast({ title: "File Operation Error", description: error, variant: "destructive" }), 0);
    }
  }, [error, isLoading, isImageFile, toast]);

  useEffect(() => {
    // New effect to show snapshot error toasts from `setSnapshotError` calls
    if (snapshotError) {
        setTimeout(() => toast({ title: "Snapshot Operation Error", description: snapshotError, variant: "destructive" }), 0);
    }
  }, [snapshotError, toast]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-var(--header-height,6rem)-2rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading file...</p>
      </div>
    );
  }

  const topLevelError = error || (snapshotError && !isImageFile ? snapshotError : null);

  if (topLevelError && (!fileContent && !isImageFile) && decodedFilePath) { 
    return (
      <div className="p-4">
        <PageHeader title="Error Loading File" description={topLevelError} />
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
  const createSnapshotButtonDisabled = isCreatingSnapshot || isLoadingSnapshots || isImageFile || (!hasUnsavedChanges && !globalDebugModeActive);

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
      
      <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveChanges}
                  disabled={saveButtonDisabled || isImageFile}
                  className="shadow-sm hover:scale-105"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save Changes (Ctrl+S)</p>
              </TooltipContent>
            </Tooltip>
            {!isImageFile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSearchQuery(""); 
                      setSearchMatches([]);
                      setCurrentMatchIndex(-1);
                      setIsFindDialogOpen(true);
                    }}
                    className="shadow-sm hover:scale-105"
                  >
                    <SearchIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Find</p>
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
          {!isImageFile && (
            <TooltipProvider>
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shadow-sm hover:scale-105 w-7 h-7"
                        disabled={isLoadingSnapshots || isImageFile}
                      >
                        {isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="h-3 w-3 animate-spin"/> : <Camera className="h-3 w-3" />}
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Snapshots</p>
                  </TooltipContent>
                  <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
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
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="truncate max-w-[150px] sm:max-w-[200px]">{fileName}</span>
          {!isImageFile && (
            <>
              <span className="mx-1">|</span>
              <span>Lang: {editorLanguage}</span>
              <span className="mx-1">|</span>
              <span>Chars: {fileContent.length}</span>
              <span className="mx-1">|</span>
              <span>Lines: {fileContent.split('\n').length}</span>
              {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">*</span>}
            </>
          )}
          {!isWritable && <span className="ml-2 font-semibold text-destructive">(Read-only)</span>}
        </div>
      </div>

      {!isWritable && !isImageFile && (
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
      {isSnapshotViewerOpen && selectedSnapshotForViewer && (
        <SnapshotViewerDialog
          isOpen={isSnapshotViewerOpen}
          onOpenChange={setIsSnapshotViewerOpen}
          snapshot={selectedSnapshotForViewer}
        />
      )}

      {/* Custom Find Dialog */}
      <Dialog open={isFindDialogOpen} onOpenChange={setIsFindDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Find in File</DialogTitle>
            <DialogDescription>
              Search for text within the current file.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSearchSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="find-query" className="text-right col-span-1">
                  Search
                </Label>
                <Input
                  id="find-query"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  className="col-span-3"
                  placeholder="Enter text to find..."
                  autoFocus
                />
              </div>
              <div className="text-xs text-muted-foreground col-span-4 pl-[calc(25%+1rem)]">
                Press Enter to search.
              </div>
              <div className="col-span-4">
                <Label className="text-xs text-muted-foreground">Quick Search:</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                    {PRESET_SEARCH_TERMS.map(term => (
                        <Button key={term} type="button" variant="outline" size="sm" onClick={() => handlePresetSearch(term)} className="text-xs px-2 py-1 h-auto">
                            {term}
                        </Button>
                    ))}
                </div>
              </div>
            </div>
            <DialogFooter className="justify-between sm:flex-row flex-col-reverse gap-2 sm:gap-0">
                <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon" onClick={handlePreviousMatch} disabled={searchMatches.length === 0}>
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={handleNextMatch} disabled={searchMatches.length === 0}>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                    {searchMatches.length > 0 && (
                         <span className="text-sm text-muted-foreground ml-2">
                           {currentMatchIndex + 1} of {searchMatches.length}
                         </span>
                    )}
                     {searchMatches.length === 0 && searchQuery && currentMatchIndex === -1 && ( // Show "No matches" only after a search
                         <span className="text-sm text-muted-foreground ml-2">
                           No matches
                         </span>
                    )}
                </div>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={!searchQuery.trim()}>
                  Find
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
