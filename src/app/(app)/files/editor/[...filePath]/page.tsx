
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
  X,
  CaseSensitive,
} from "lucide-react";
import path from 'path-browserify';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
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

import { SearchCursor } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

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
    case 'yaml': case 'yml': return 'yaml'; // Added YAML
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

  // State for custom search widget
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

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
      return '';
    }
  }, [encodedFilePathFromParams]);

  const fileName = useMemo(() => path.basename(decodedFilePath || 'Untitled'), [decodedFilePath]);
  const hasUnsavedChanges = useMemo(() => fileContent !== originalFileContent, [fileContent, originalFileContent]);

  useEffect(() => {
    if (error) {
      setTimeout(() => toast({ title: "File Operation Error", description: error, variant: "destructive" }), 0);
    }
  }, [error, toast]);

  useEffect(() => {
    if (snapshotError) {
      setTimeout(() => toast({ title: "Snapshot Operation Error", description: snapshotError, variant: "destructive" }), 0);
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
        let errData = { error: `Failed to fetch snapshots. Status: ${response.status}` };
        try {
          const text = await response.text();
          if(text) errData = JSON.parse(text);
        } catch (e) {
          // If JSON parsing fails or response is empty, use the status text
          errData.error = `${errData.error}. Response: ${response.statusText || "Could not read error response."}`;
        }
        if (globalDebugModeActive) console.log("[FileEditorPage] fetchSnapshots API Error JSON:", errData);
        throw new Error(errData.error || `Failed to fetch snapshots. Status: ${response.status}`);
      }
      const data = await response.json();
      if (data && Array.isArray(data.snapshots)) {
        setServerSnapshots(data.snapshots);
      } else {
        setServerSnapshots([]);
      }
    } catch (e: any) {
      const errorMessage = e.message || "An unexpected error occurred while fetching snapshots.";
      if (globalDebugModeActive) console.error("[FileEditorPage] fetchSnapshots Error:", e);
      setSnapshotError(errorMessage);
      setServerSnapshots([]);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [decodedFilePath, globalDebugModeActive, isImageFile]);

  const fetchFileContent = useCallback(async () => {
    if (!decodedFilePath) {
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
        let errorMsg = `Failed to fetch file. Status: ${response.status}`;
        try {
            const text = await response.text();
            if(text){
                data = JSON.parse(text);
                errorMsg = data.error || data.details || data.message || errorMsg;
            } else {
                 errorMsg = `${errorMsg}. Server sent an empty error response.`;
            }
        } catch (e) {
             const textError = await response.text().catch(() => "Unknown server response");
             errorMsg = `${errorMsg}. Response: ${textError.substring(0,150) || "Empty response"}`;
        }
        throw new Error(errorMsg);
      }

      data = await response.json();

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

    } catch (e: any) {
        setError(e.message || "An unexpected error occurred while fetching file content.");
        setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, fetchSnapshots]);

  useEffect(() => {
    if (!decodedFilePath && encodedFilePathFromParams) {
      setError("Invalid file path in URL.");
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

      let result;
      let errorToThrow = null;
      const responseText = await response.text(); // Read text first

      if (globalDebugModeActive) console.log("[FileEditorPage] handleCreateSnapshot: API Response Status:", response.status, "Body Text:", responseText.substring(0,200) + "...");
      
      try {
          if(responseText) {
              result = JSON.parse(responseText);
          } else if (response.ok) { // If response is OK but body is empty
              console.warn("[FileEditorPage] handleCreateSnapshot: API Success Response was empty. This is unexpected.");
              result = { snapshots: serverSnapshots }; // Fallback to current snapshots or re-fetch
          } else { // If response is NOT OK and body is empty
              result = { error: `API Error ${response.status}: Failed to create snapshot. Server sent an empty error response.`, details: response.statusText };
          }
      } catch (parseError) {
          console.error("[FileEditorPage] handleCreateSnapshot: Could not parse JSON from API response. Status:", response.status, "Text:", responseText);
          if (response.ok) {
              errorToThrow = new Error("Failed to parse successful snapshot creation response from server. Response text: " + responseText.substring(0,100));
              result = { snapshots: serverSnapshots }; // Fallback
          } else {
              result = { error: `API Error ${response.status}: ${response.statusText || "Failed to create snapshot."}. Server response was not valid JSON.`, details: responseText.substring(0, 100) };
          }
      }

      if (!response.ok) {
        const errorMsg = result.error || result.details || `API Error ${response.status}: ${result.message || "Failed to create snapshot."}`;
        errorToThrow = new Error(errorMsg);
      }
      
      if (errorToThrow) throw errorToThrow;

      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${fileName} created.` }),0);

      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots);
      } else {
        if (globalDebugModeActive) console.warn("[FileEditorPage] handleCreateSnapshot: 'snapshots' array not found in API response, re-fetching all.");
        await fetchSnapshots();
      }
    } catch (e: any) {
      const apiErrorMsg = e.message || "An unexpected error occurred while creating the snapshot.";
      if (globalDebugModeActive) console.error("[FileEditorPage] handleCreateSnapshot API Error (final catch):", e);
      setSnapshotError(apiErrorMsg);
      // Do not call toast here, it's handled by snapshotError useEffect
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [decodedFilePath, fileContent, editorLanguage, fileName, isImageFile, globalDebugModeActive, fetchSnapshots, toast, serverSnapshots]);

  const handleSaveChanges = useCallback(async () => {
    if (!decodedFilePath || !isWritable || isImageFile) {
      setTimeout(() => toast({ title: "Cannot Save", description: !decodedFilePath ? "No active file." : !isWritable ? "File not writable." : "Image saving not supported here.", variant: "destructive" }),0);
      return;
    }

    if (hasUnsavedChanges) {
      handleCreateSnapshot(); // This will be awaited implicitly if it's an async function, but here it's a fire-and-forget on the client side before saving.
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: decodedFilePath, content: fileContent }),
      });
      const result = await response.json(); // Assuming server always sends JSON
      if (!response.ok) {
        throw new Error(result.error || result.details || result.message || 'Failed to save file.');
      }
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${fileName} saved.` }),0);
      setOriginalFileContent(fileContent); // Update original content on successful save
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, hasUnsavedChanges, handleCreateSnapshot, isImageFile, toast]);


  useEffect(() => {
    const canSave = !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive) && !isImageFile;
    const handleKeyDown = (event: KeyboardEvent) => {
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
    if (!editorRef.current?.view || !query.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const view = editorRef.current.view;
    // Use a regex for case-insensitive search if isCaseSensitiveSearch is false
    const searchConfig = isCaseSensitiveSearch ? query : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    const cursor = new SearchCursor(view.state.doc, searchConfig, 0, view.state.doc.length);
    const matches: Array<{ from: number; to: number }>> = [];
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
      setTimeout(() => toast({ title: "Not Found", description: `"${query}" was not found in the file.`, duration: 2000 }),0);
    }
  }, [isCaseSensitiveSearch, toast]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (newQuery.trim()) {
      // Debounce or directly perform search
      performSearch(newQuery); 
    } else {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
    }
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

  const handleNextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    goToMatch(nextIndex);
  }, [currentMatchIndex, searchMatches, goToMatch]);

  const handlePreviousSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    goToMatch(prevIndex);
  }, [currentMatchIndex, searchMatches, goToMatch]);

  const toggleCaseSensitiveSearch = () => {
    const newCaseSensitivity = !isCaseSensitiveSearch;
    setIsCaseSensitiveSearch(newCaseSensitivity);
    // Re-run search if there's a query
    if (searchQuery.trim()) {
        performSearch(searchQuery); 
    }
  };

  const handlePresetSearch = (term: string) => {
    setSearchQuery(term);
    performSearch(term); // Perform search immediately with the preset term
  };
  
  useEffect(() => {
    // Clear selection highlights when search widget is closed and there were matches
    if (!isSearchWidgetOpen) {
      setSearchMatches([]); // Clear matches array
      setCurrentMatchIndex(-1); // Reset index
      if (editorRef.current?.view && searchMatches.length > 0) { // Check if there were previous matches
        const view = editorRef.current.view;
        // Deselect by setting selection to a collapsed range at the current cursor position
        if (view.state.selection.main.from !== view.state.selection.main.to) { // If there's an active selection
             view.dispatch({ selection: EditorSelection.single(view.state.selection.main.anchor) });
        }
      }
    }
  }, [isSearchWidgetOpen, searchMatches.length]); // Added searchMatches.length


  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
     setTimeout(() => {
      if (snapshotToLoad) {
        setFileContent(snapshotToLoad.content);
        setOriginalFileContent(snapshotToLoad.content); // Treat loaded snapshot as the new original
        setEditorLanguage(snapshotToLoad.language); // Set editor language from snapshot
        toast({
          title: "Snapshot Loaded",
          description: `Loaded snapshot for ${fileName} from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}`,
        });
      } else {
        toast({
          title: "Error",
          description: "Could not find the selected snapshot.",
          variant: "destructive",
        });
      }
    }, 0);
  }, [toast, fileName]);

  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    // Placeholder for server-side logic
    setServerSnapshots(prev => 
        prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s)
    );
    const snapshot = serverSnapshots.find(s => s.id === snapshotId);
    setTimeout(() => toast({ 
        title: snapshot && !snapshot.isLocked ? "Snapshot Locked (Client)" : "Snapshot Unlocked (Client)", 
        description: "Server-side persistence for lock status is not yet implemented."
    }), 0);
  }, [serverSnapshots, toast]);

  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    // Placeholder for server-side logic
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
     setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion is not yet implemented."}), 0);
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

  const topLevelError = error || (snapshotError && !isImageFile ? snapshotError : null);

  if (topLevelError && (!fileContent && !isImageFile && !isLoading) && decodedFilePath) {
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
    <div className="flex flex-col h-full max-h-[calc(100vh-var(--header-height,6rem)-2rem)]"> {/* Ensure full height of parent minus header */}
      <PageHeader
        title={`${fileName}`}
        description={<span className="font-mono text-xs break-all">{decodedFilePath}</span>}
        actions={
          <Button onClick={() => router.push('/files')} variant="outline" className="shadow-md hover:scale-105">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
          </Button>
        }
      />

      <div className="flex items-center justify-between p-2 border-b bg-muted/50 flex-shrink-0">
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
          </TooltipProvider>
          {!isImageFile && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSearchWidgetOpen(prev => !prev)} // Toggle search widget
                    className="shadow-sm hover:scale-105"
                  >
                    <SearchIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Find</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
          <DropdownMenu>
            <TooltipProvider>
                 <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild disabled={isImageFile || isLoadingSnapshots || isCreatingSnapshot}>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="shadow-sm hover:scale-105 w-7 h-7" // Made slightly smaller
                              >
                                {isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="h-3 w-3 animate-spin"/> : <Camera className="h-3 w-3" />}
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent><p>Snapshots</p></TooltipContent>
                 </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end" className="w-96 max-w-[90vw]"> {/* Increased width */}
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
                        <div className="flex items-center ml-1 gap-0.5 flex-shrink-0"> {/* Reduced gap */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View Snapshot">
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>View Snapshot</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}>
                                  {snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>{snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete Snapshot">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Delete Snapshot</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
          <span className="truncate max-w-[100px] sm:max-w-[150px]">{fileName}</span>
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
      {error && (fileContent || isImageFile) && !isLoading && !isImageFile && (
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
      <div className="flex-grow relative p-0 bg-background min-h-0"> {/* Parent of editor area */}
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
               <img
                src={`/api/panel-daemon/file?path=${encodeURIComponent(decodedFilePath)}`}
                alt={`Preview of ${fileName}`}
                className="max-w-full max-h-full object-contain"
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
            className="h-full w-full border-0 rounded-none" // CodeMirror editor itself
          />
        )}

        {/* Custom Search Widget */}
        {isSearchWidgetOpen && !isImageFile && (
          <div className="absolute top-2 right-2 z-10 bg-card p-2 rounded-lg shadow-lg border w-60 space-y-1.5">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground px-1">Find:</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsSearchWidgetOpen(false)}>
                    <X className="h-3 w-3" />
                </Button>
            </div>
            <Input
              id="find-query-widget"
              value={searchQuery}
              onChange={handleSearchInputChange}
              placeholder="Search..."
              className="h-7 text-xs px-2 py-1" // Made input smaller
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) performSearch(searchQuery); }}
            />
             <div className="flex items-center justify-between gap-1 flex-wrap"> {/* Added flex-wrap */}
              <div className="flex items-center gap-0.5"> {/* Reduced gap */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Previous</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Next</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <Button
                        type="button"
                        variant={isCaseSensitiveSearch ? "secondary" : "ghost"}
                        size="icon"
                        className="h-6 w-6" // Smaller icon button
                        onClick={toggleCaseSensitiveSearch}
                      >
                        <CaseSensitive className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Case Sensitive ({isCaseSensitiveSearch ? "On" : "Off"})</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
               <span className="text-xs text-muted-foreground px-1 truncate"> {/* Made text smaller and truncate */}
                {searchMatches.length > 0 ? `${currentMatchIndex + 1} of ${searchMatches.length}` : searchQuery.trim() ? "No matches" : ""}
              </span>
            </div>
            {/* Preset Search Terms */}
            <div className="flex flex-wrap gap-1 pt-1">
                {PRESET_SEARCH_TERMS.map(term => (
                    <Button
                        key={term}
                        variant="outline"
                        size="xs" // Extra small Shadcn button variant
                        className="text-xs px-1.5 py-0.5 h-auto" // Custom compact styling
                        onClick={() => handlePresetSearch(term)}
                    >
                        {term}
                    </Button>
                ))}
            </div>
          </div>
        )}
      </div>

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
```