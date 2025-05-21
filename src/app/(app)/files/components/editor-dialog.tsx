
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription, // Will likely remove this for file path
  DialogFooter,
  // DialogClose, // Will handle close via onOpenChange
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
  Camera,
  Search as SearchIcon,
  FileWarning,
  AlertTriangle,
  Eye,
  Lock,
  Unlock,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
  Expand,
  Shrink,
} from "lucide-react";
import path from 'path-browserify';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
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
import SnapshotViewerDialog from './snapshot-viewer-dialog'; // Import from sibling components folder
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { cn } from '@/lib/utils';

import { openSearchPanel, SearchCursor } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';


export interface Snapshot {
  id: string;
  timestamp: string;
  content: string;
  language: string;
  isLocked?: boolean;
}

interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null;
}

const MAX_SERVER_SNAPSHOTS = 10; // This is now for client-side, but keep name for potential future server integration
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];

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

export default function EditorDialog({ isOpen, onOpenChange, filePathToEdit }: EditorDialogProps) {
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const [fileContent, setFileContent] = useState<string>('');
  const [originalFileContent, setOriginalFileContent] = useState<string>('');
  const [isWritable, setIsWritable] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editorLanguage, setEditorLanguage] = useState<string>('plaintext');

  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]); // Renaming for clarity, still client-side for now
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  // Search widget state
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0});
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const fileName = useMemo(() => path.basename(filePathToEdit || 'Untitled'), [filePathToEdit]);
  const hasUnsavedChanges = useMemo(() => fileContent !== originalFileContent, [fileContent, originalFileContent]);

  const resetEditorState = useCallback(() => {
    setFileContent('');
    setOriginalFileContent('');
    setIsWritable(true);
    setError(null);
    setEditorLanguage('plaintext');
    setServerSnapshots([]);
    setSnapshotError(null);
    setIsSearchWidgetOpen(false);
    setSearchQuery("");
    // Don't reset position or maximized state here, let user control that
  }, []);

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

  const fetchFileContentAndSettings = useCallback(async () => {
    if (!filePathToEdit) {
      setIsLoading(false);
      return;
    }
    console.log('[EditorDialog] fetchFileContentAndSettings CALLED for:', filePathToEdit);
    setIsLoading(true);
    setError(null);
    setSnapshotError(null);
    setServerSnapshots([]);

    try {
      const settingsResult = await loadPanelSettings();
      if (settingsResult.status === 'success' && settingsResult.data) {
        setGlobalDebugModeActive(settingsResult.data.debugMode);
      } else {
        setGlobalDebugModeActive(false); // Fallback
      }

      const currentFileLang = getLanguageFromFilename(fileName);
      setEditorLanguage(currentFileLang);

      const response = await fetch(`/api/panel-daemon/file?path=${encodeURIComponent(filePathToEdit)}&view=true`);
      let data;
      if (!response.ok) {
        // ... (error handling from original editor page)
        const errText = await response.text();
        try { data = JSON.parse(errText); } catch { data = { error: errText.substring(0,100) || `HTTP error ${response.status}` }; }
        throw new Error(data.error || data.details || data.message || `Failed to fetch file. Status: ${response.status}`);
      }
      data = await response.json();
      if (typeof data.writable !== 'boolean') throw new Error("Invalid response: missing 'writable' status.");
      if (typeof data.content !== 'string') throw new Error("Invalid response: missing 'content'.");
      
      setIsWritable(data.writable);
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      
      // Fetch snapshots after file content
      await fetchSnapshots(filePathToEdit);

    } catch (e: any) {
      console.error("[EditorDialog] Error in fetchFileContentAndSettings:", e);
      setError(e.message || "An unexpected error occurred while fetching file content.");
      setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [filePathToEdit, fileName, toast]); // Removed fetchSnapshots from here to avoid direct dependency cycle

  const fetchSnapshots = useCallback(async (currentFilePath: string) => {
    if (!currentFilePath) return;
    console.log(`[EditorDialog] fetchSnapshots CALLED for: ${currentFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentFilePath)}`);
      if (!response.ok) {
        // ... (error handling from original editor page) ...
        let errData;
        try { const text = await response.text(); if (text) errData = JSON.parse(text); else errData = { error: `Failed to fetch snapshots. Status: ${response.status}`}; }
        catch { errData = { error: `Failed to fetch snapshots. Status: ${response.status}` }; }
        throw new Error(errData.error || `Failed to fetch snapshots. Status: ${response.status}`);
      }
      const data = await response.json();
      if (data && Array.isArray(data.snapshots)) {
        setServerSnapshots(data.snapshots);
      } else {
        setServerSnapshots([]);
      }
    } catch (e: any) {
      console.error("[EditorDialog] fetchSnapshots Error:", e);
      setSnapshotError(e.message || "An unexpected error occurred while fetching snapshots.");
      setServerSnapshots([]);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, []);


  useEffect(() => {
    if (isOpen && filePathToEdit) {
      fetchFileContentAndSettings();
      if (!isMaximized) { // Center dialog on open/file change if not maximized
          const defaultWidth = Math.min(window.innerWidth * 0.8, 1000); 
          const defaultHeight = Math.min(window.innerHeight * 0.75, 800);
          setPosition({ 
            x: window.innerWidth / 2 - defaultWidth / 2, 
            y: window.innerHeight / 2 - defaultHeight / 2 
          });
      }
    } else if (!isOpen) {
      resetEditorState(); // Reset when dialog closes
    }
  }, [isOpen, filePathToEdit, fetchFileContentAndSettings, resetEditorState, isMaximized]);

  const handleSaveChanges = useCallback(async () => {
    if (!filePathToEdit || !isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: !filePathToEdit ? "No active file." : "File not writable.", variant: "destructive" }),0);
      return;
    }
    if (hasUnsavedChanges) {
      // No direct call to handleCreateSnapshot here, it's manual for now or tied to save button in future
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePathToEdit, content: fileContent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to save file.');
      
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${fileName} saved.` }),0);
      setOriginalFileContent(fileContent);
      // Optionally, create a snapshot on successful save
      // await handleCreateSnapshot(); // Or a more specific server-side snapshot on save
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  }, [filePathToEdit, fileContent, fileName, isWritable, hasUnsavedChanges, toast]);

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const canSave = !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive);
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (canSave) {
          handleSaveChanges();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSaving, isWritable, hasUnsavedChanges, handleSaveChanges, globalDebugModeActive]);

  // Snapshot logic (adapted from original editor page)
  const handleCreateSnapshot = useCallback(async () => {
    if (!filePathToEdit) return;
    console.log(`[EditorDialog] handleCreateSnapshot CALLED for: ${filePathToEdit}, Lang: ${editorLanguage}, Content Length: ${fileContent.length}`);
    setIsCreatingSnapshot(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: filePathToEdit, content: fileContent, language: editorLanguage }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to create snapshot.');
      
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${fileName} created.` }),0);
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots);
      } else {
        await fetchSnapshots(filePathToEdit); // Re-fetch if response format is unexpected
      }
    } catch (e: any) {
      setSnapshotError(e.message || "An unexpected error occurred while creating snapshot.");
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [filePathToEdit, fileContent, editorLanguage, fileName, toast, fetchSnapshots]);

  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
     setTimeout(() => {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content); 
      setEditorLanguage(snapshotToLoad.language); 
      toast({ title: "Snapshot Loaded", description: `Loaded snapshot for ${fileName} from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}` });
    }, 0);
  }, [toast, fileName]);

  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    // Client-side only for now, backend for this is pending
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s));
    setTimeout(() => toast({ title: "Snapshot Lock Toggled (Client)", description: "Persistence pending server implementation." }),0);
  }, []);
  
  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    // Client-side only for now
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
    setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion pending."}), 0);
  }, [toast]);

  const handleViewSnapshotInPopup = (snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };

  // Search logic (adapted from original editor page)
  const performSearch = useCallback((query: string) => {
    if (!editorRef.current?.view || !query.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const view = editorRef.current.view;
    const cursor = new SearchCursor(view.state.doc, query, 0, view.state.doc.length, isCaseSensitiveSearch ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase());
    const matches: Array<{ from: number; to: number }>> = [];
    while (!cursor.next().done) { matches.push({ from: cursor.value.from, to: cursor.value.to }); }
    setSearchMatches(matches);
    if (matches.length > 0) {
      setCurrentMatchIndex(0);
      view.dispatch({ selection: EditorSelection.single(matches[0].from, matches[0].to), effects: EditorView.scrollIntoView(matches[0].from, { y: "center" }) });
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${query}" was not found.`, duration: 2000 }),0);
    }
  }, [isCaseSensitiveSearch, toast]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (newQuery.trim()) { performSearch(newQuery); } 
    else { setSearchMatches([]); setCurrentMatchIndex(-1); }
  };
  const goToMatch = useCallback((index: number) => {
    if (editorRef.current?.view && searchMatches[index]) {
      const match = searchMatches[index];
      editorRef.current.view.dispatch({ selection: EditorSelection.single(match.from, match.to), effects: EditorView.scrollIntoView(match.from, { y: "center" }) });
      setCurrentMatchIndex(index);
    }
  }, [searchMatches]);
  const handleNextSearchMatch = useCallback(() => { if (searchMatches.length === 0) return; const nextIndex = (currentMatchIndex + 1) % searchMatches.length; goToMatch(nextIndex); }, [currentMatchIndex, searchMatches, goToMatch]);
  const handlePreviousSearchMatch = useCallback(() => { if (searchMatches.length === 0) return; const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length; goToMatch(prevIndex); }, [currentMatchIndex, searchMatches, goToMatch]);
  const toggleCaseSensitiveSearch = () => { setIsCaseSensitiveSearch(prev => !prev); if (searchQuery.trim()) { performSearch(searchQuery); } };
  const handlePresetSearch = (term: string) => { setSearchQuery(term); performSearch(term); };
  
  useEffect(() => {
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
      setSearchMatches([]); setCurrentMatchIndex(-1);
      if (editorRef.current?.view) {
        const view = editorRef.current.view;
        if (view.state.selection.main.from !== view.state.selection.main.to) {
          view.dispatch({ selection: EditorSelection.single(view.state.selection.main.anchor) });
        }
      }
    }
  }, [isSearchWidgetOpen, searchMatches.length]);

  // Dragging logic (adapted from ImageViewerDialog)
  const handleDialogMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMaximized || !dialogContentRef.current) return;
    const headerElement = dialogContentRef.current.querySelector('[data-dialog-header="true"]');
    if (headerElement && headerElement.contains(e.target as Node) && !(e.target as HTMLElement).closest('button')) {
      setIsDragging(true);
      const dialogRect = dialogContentRef.current.getBoundingClientRect();
      setDragStart({ x: e.clientX - dialogRect.left, y: e.clientY - dialogRect.top });
    }
  }, [isMaximized]);

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || isMaximized || !dialogContentRef.current) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart, isMaximized]);

  const handleWindowMouseUp = useCallback(() => { setIsDragging(false); }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    } else {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging, handleWindowMouseMove, handleWindowMouseUp]);
  
  const toggleMaximize = () => {
    if (isMaximized) {
      setPosition(prevPosition);
    } else {
      if (dialogContentRef.current) {
        const rect = dialogContentRef.current.getBoundingClientRect();
        setPrevPosition({ x: rect.left, y: rect.top });
      }
      setPosition({x: 0, y: 0}); 
    }
    setIsMaximized(!isMaximized);
  };

  const dialogStyle: React.CSSProperties = isMaximized
  ? { position: 'fixed', left: '0px', top: '0px', width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', transform: 'none', borderRadius: '0', margin: '0' }
  : { position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, transform: 'none' };

  const saveButtonDisabled = isSaving || !isWritable || (!hasUnsavedChanges && !globalDebugModeActive);
  const createSnapshotButtonDisabled = isCreatingSnapshot || isLoadingSnapshots || (!hasUnsavedChanges && !globalDebugModeActive);


  if (!isOpen && !filePathToEdit) return null; // Don't render anything if not open and no file path

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && hasUnsavedChanges) {
        if (!window.confirm("You have unsaved changes. Are you sure you want to close?")) {
          return; // Don't close if user cancels
        }
      }
      if (!open && isMaximized) setIsMaximized(false);
      onOpenChange(open);
      if (!open) resetEditorState(); // Reset on close
    }}>
      <DialogContent
        ref={dialogContentRef}
        className={cn(
          "p-0 flex flex-col shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ease-in-out",
          isMaximized 
            ? "w-screen h-screen max-w-full max-h-full !rounded-none" 
            : "w-[90vw] max-w-4xl h-[85vh] max-h-[900px]" // Default dimensions
        )}
        style={dialogStyle}
        onOpenAutoFocus={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader
          data-dialog-header="true"
          className={cn(
            "flex-shrink-0 flex flex-row items-center justify-between p-3 pl-4 border-b bg-muted/60",
            !isMaximized && "cursor-grab active:cursor-grabbing"
          )}
          onMouseDown={handleDialogMouseDown}
        >
          <DialogTitle className="text-sm font-medium truncate max-w-[calc(100%-150px)]">
            {fileName || 'File Editor'} <span className="text-xs text-muted-foreground font-normal ml-1 truncate">({filePathToEdit})</span>
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMaximize}>
              {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSaveChanges} disabled={saveButtonDisabled} className="shadow-sm hover:scale-105">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="shadow-sm hover:scale-105"><SearchIcon className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Find</p></TooltipContent></Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mr-1">
            <DropdownMenu>
              <TooltipProvider>
                <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild disabled={isLoadingSnapshots || isCreatingSnapshot}><Button variant="ghost" size="icon" className="shadow-sm hover:scale-105 w-7 h-7">{isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="h-3 w-3 animate-spin"/> : <Camera className="h-3 w-3" />}</Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent><p>Snapshots</p></TooltipContent></Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Server Snapshots (Max: {MAX_SERVER_SNAPSHOTS})</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTimeout(handleCreateSnapshot,0)} disabled={createSnapshotButtonDisabled}>{isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Create Snapshot</DropdownMenuItem>
                {serverSnapshots.length > 0 && (<> <DropdownMenuSeparator /> <DropdownMenuGroup><DropdownMenuLabel className="text-xs px-2">Recent ({serverSnapshots.length})</DropdownMenuLabel>{snapshotError && <DropdownMenuLabel className="text-xs px-2 text-destructive">{snapshotError}</DropdownMenuLabel>} {serverSnapshots.map(snapshot => (<DropdownMenuItem key={snapshot.id} className="flex justify-between items-center" onSelect={(e) => e.preventDefault()}><span onClick={() => handleLoadSnapshot(snapshot)} className="cursor-pointer flex-grow hover:text-primary text-xs truncate pr-2">{format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}</span><div className="flex items-center ml-1 gap-0.5 flex-shrink-0"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View"><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock" : "Lock"}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete"><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider></div></DropdownMenuItem>))} </DropdownMenuGroup></>)}
                {serverSnapshots.length === 0 && !isLoadingSnapshots && !isCreatingSnapshot && !snapshotError && (<DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots.</DropdownMenuLabel>)}
                <DropdownMenuSeparator /> <DropdownMenuLabel className="text-xs text-muted-foreground px-2 whitespace-normal">Server-side persistence for lock/delete is not yet fully implemented.</DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
            <span>Lang: {editorLanguage}</span> <span className="mx-1">|</span>
            <span>Chars: {fileContent.length}</span> <span className="mx-1">|</span>
            <span>Lines: {fileContent.split('\n').length}</span>
            {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">*</span>}
            {!isWritable && <span className="ml-2 font-semibold text-destructive">(Read-only)</span>}
          </div>
        </div>
        
        {/* Main Editor Area */}
        <div className={cn("flex-grow relative p-0 bg-background min-h-0", isDragging && "pointer-events-none")}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}
          {!isLoading && error && (
            <div className="p-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading File</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>
          )}
          {!isLoading && !error && !isWritable && (
            <div className="p-4"><Alert variant="destructive"><FileWarning className="h-4 w-4" /><AlertTitle>Read-only Mode</AlertTitle><AlertDescription>This file is not writable. Changes cannot be saved.</AlertDescription></Alert></div>
          )}
          {!isLoading && !error && (
            <CodeEditor
              ref={editorRef}
              value={fileContent}
              onChange={setFileContent}
              language={editorLanguage}
              readOnly={isSaving || !isWritable}
              className="h-full w-full border-0 rounded-none"
            />
          )}

          {isSearchWidgetOpen && (
            <div className="absolute top-2 right-2 z-10 bg-card p-2 rounded-lg shadow-lg border w-60 space-y-1.5">
              <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground px-1">Find:</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsSearchWidgetOpen(false)}><X className="h-3 w-3" /></Button></div>
              <Input id="find-query-widget" value={searchQuery} onChange={handleSearchInputChange} placeholder="Search..." className="h-7 text-xs px-2 py-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) performSearch(searchQuery); }}/>
              <div className="flex items-center justify-between gap-1 flex-wrap"><div className="flex items-center gap-0.5"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0}><ChevronUp className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Previous</p></TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0}><ChevronDown className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Next</p></TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button type="button" variant={isCaseSensitiveSearch ? "secondary" : "ghost"} size="icon" className="h-6 w-6" onClick={toggleCaseSensitiveSearch}><CaseSensitive className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Case Sensitive ({isCaseSensitiveSearch ? "On" : "Off"})</p></TooltipContent></Tooltip></TooltipProvider></div><span className="text-xs text-muted-foreground px-1 truncate">{searchMatches.length > 0 ? `${currentMatchIndex + 1} of ${searchMatches.length}` : searchQuery.trim() ? "No matches" : ""}</span></div>
              <div className="flex flex-wrap gap-1 pt-1">{PRESET_SEARCH_TERMS.map(term => (<Button key={term} variant="outline" size="xs" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button>))}</div>
            </div>
          )}
        </div>
        
        {/* Dialog Footer could be used for other global actions if needed, or removed if toolbar handles all */}
        {/* <DialogFooter className="p-2 border-t bg-muted/50 flex-shrink-0"> ... </DialogFooter> */}

        {isSnapshotViewerOpen && selectedSnapshotForViewer && (
          <SnapshotViewerDialog
            isOpen={isSnapshotViewerOpen}
            onOpenChange={setIsSnapshotViewerOpen}
            snapshot={selectedSnapshotForViewer}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
