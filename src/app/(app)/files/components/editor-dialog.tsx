
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor'; // Assuming this is your CodeMirror wrapper
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
import { Alert, AlertDescription, AlertTitle as ShadcnAlertTitle } from "@/components/ui/alert";
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
import SnapshotViewerDialog from './snapshot-viewer-dialog';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { cn } from '@/lib/utils';

// CodeMirror search imports
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

const MAX_SERVER_SNAPSHOTS = 10; 
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];

function getLanguageFromFilename(filename: string | null): string {
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
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0 });
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
    setCurrentMatchIndex(-1);
    setSearchMatches([]);
  }, []);

  const fetchSnapshots = useCallback(async (currentFilePath: string) => {
    if (!currentFilePath) return;
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentFilePath)}`);
      if (!response.ok) {
        let errData;
        try { 
          const text = await response.text(); 
          errData = text ? JSON.parse(text) : { error: `Failed to fetch snapshots. Status: ${response.status}` }; 
        } catch { 
          errData = { error: `Failed to fetch snapshots. Status: ${response.status}` }; 
        }
        throw new Error(errData.error || `Failed to fetch snapshots. Status: ${response.status}`);
      }
      const data = await response.json();
      setServerSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch (e: any) {
      setSnapshotError(e.message || "An unexpected error occurred while fetching snapshots.");
      setServerSnapshots([]);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, []);

  const fetchFileContentAndSettings = useCallback(async () => {
    if (!filePathToEdit) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setSnapshotError(null);
    setServerSnapshots([]);

    try {
      const settingsResult = await loadPanelSettings();
      setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);

      const currentFileLang = getLanguageFromFilename(filePathToEdit);
      setEditorLanguage(currentFileLang);

      const response = await fetch(`/api/panel-daemon/file?path=${encodeURIComponent(filePathToEdit)}&view=true`);
      if (!response.ok) {
        const errText = await response.text();
        const data = errText ? JSON.parse(errText) : { error: `HTTP error ${response.status}` };
        throw new Error(data.error || data.details || data.message || `Failed to fetch file. Status: ${response.status}`);
      }
      const data = await response.json();
      if (typeof data.writable !== 'boolean' || typeof data.content !== 'string') {
        throw new Error("Invalid response from server: missing 'writable' or 'content'.");
      }
      
      setIsWritable(data.writable);
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      await fetchSnapshots(filePathToEdit);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while fetching file content.");
      setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [filePathToEdit, fetchSnapshots]);

  useEffect(() => {
    if (isOpen && filePathToEdit) {
      fetchFileContentAndSettings();
      if (!isMaximized) {
        const defaultWidth = Math.min(window.innerWidth * 0.8, 1000);
        const defaultHeight = Math.min(window.innerHeight * 0.75, 800);
        setPosition({
          x: Math.max(0, window.innerWidth / 2 - defaultWidth / 2),
          y: Math.max(0, window.innerHeight / 2 - defaultHeight / 2)
        });
      }
    } else if (!isOpen) {
      resetEditorState();
    }
  }, [isOpen, filePathToEdit, fetchFileContentAndSettings, resetEditorState, isMaximized]);
  
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

  const handleCreateSnapshot = useCallback(async () => {
    if (!filePathToEdit) return;
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
      setServerSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []);
    } catch (e: any) {
      setSnapshotError(e.message || "An unexpected error occurred while creating snapshot.");
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [filePathToEdit, fileContent, editorLanguage, fileName, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (!filePathToEdit || !isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: !filePathToEdit ? "No active file." : "File not writable.", variant: "destructive" }),0);
      return;
    }

    if (hasUnsavedChanges) {
      await handleCreateSnapshot(); 
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
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  }, [filePathToEdit, fileContent, fileName, isWritable, hasUnsavedChanges, toast, handleCreateSnapshot]);

  useEffect(() => {
    const canSave = isOpen && !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive);
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
  }, [isOpen, isSaving, isWritable, hasUnsavedChanges, globalDebugModeActive, handleSaveChanges]);

  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
     setTimeout(() => {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content); 
      setEditorLanguage(snapshotToLoad.language); 
      toast({ title: "Snapshot Loaded", description: `Loaded snapshot for ${fileName} from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}` });
    }, 0);
  }, [toast, fileName]);
  
  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s));
    setTimeout(() => toast({ title: "Snapshot Lock Toggled (Client)", description: "Server-side persistence is not yet implemented." }),0);
  }, [toast]);
  
  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
    setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion is not yet implemented."}), 0);
  }, [toast]);

  const handleViewSnapshotInPopup = (snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };

  const performSearch = useCallback((query: string, caseSensitive: boolean) => {
    if (!editorRef.current?.view || !query.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const view = editorRef.current.view;
    const cursor = new SearchCursor(view.state.doc, query, 0, view.state.doc.length, caseSensitive ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase());
    const matchesFound: Array<{ from: number; to: number }>> = [];
    while (!cursor.next().done) { matchesFound.push({ from: cursor.value.from, to: cursor.value.to }); }
    setSearchMatches(matchesFound);
    if (matchesFound.length > 0) {
      setCurrentMatchIndex(0);
      view.dispatch({ selection: EditorSelection.single(matchesFound[0].from, matchesFound[0].to), effects: EditorView.scrollIntoView(matchesFound[0].from, { y: "center" }) });
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${query}" was not found.`, duration: 2000 }),0);
    }
  }, [toast]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (newQuery.trim()) { performSearch(newQuery, isCaseSensitiveSearch); } 
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
  
  const toggleCaseSensitiveSearch = () => { 
    const newCaseSensitive = !isCaseSensitiveSearch;
    setIsCaseSensitiveSearch(newCaseSensitive); 
    if (searchQuery.trim()) { performSearch(searchQuery, newCaseSensitive); } 
  };
  const handlePresetSearch = (term: string) => { setSearchQuery(term); performSearch(term, isCaseSensitiveSearch); };
  
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
    const newX = Math.max(0, Math.min(e.clientX - dragStart.x, window.innerWidth - dialogContentRef.current.offsetWidth));
    const newY = Math.max(0, Math.min(e.clientY - dragStart.y, window.innerHeight - dialogContentRef.current.offsetHeight));
    setPosition({ x: newX, y: newY });
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
  ? { position: 'fixed', left: '0px', top: '0px', width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', transform: 'none', borderRadius: '0px', margin: '0px' }
  : { position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, transform: 'none' };

  const saveButtonDisabled = isSaving || !isWritable || (!hasUnsavedChanges && !globalDebugModeActive);
  const createSnapshotButtonDisabled = isCreatingSnapshot || isLoadingSnapshots || (!globalDebugModeActive && !hasUnsavedChanges);

  const handleCloseDialog = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to close? Changes will be lost.")) {
        return;
      }
    }
    if (isMaximized) setIsMaximized(false);
    onOpenChange(false);
    resetEditorState();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        className={cn(
          "p-0 flex flex-col shadow-2xl rounded-lg overflow-hidden transition-all duration-300 ease-in-out",
          isMaximized 
            ? "w-screen h-screen max-w-full max-h-full !rounded-none" 
            : "w-[90vw] max-w-4xl h-[85vh] max-h-[900px]"
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleMaximize} aria-label={isMaximized ? "Restore" : "Maximize"}>
              {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCloseDialog} aria-label="Close editor">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
          <div className="flex items-center gap-1">
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSaveChanges} disabled={saveButtonDisabled} className="shadow-sm hover:scale-105">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="shadow-sm hover:scale-105"><SearchIcon className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Find</p></TooltipContent></Tooltip></TooltipProvider>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mr-1">
            <DropdownMenu>
              <TooltipProvider><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild disabled={isLoadingSnapshots || isCreatingSnapshot}><Button variant="ghost" size="icon" className="shadow-sm hover:scale-105 w-7 h-7">{isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="h-3 w-3 animate-spin"/> : <Camera className="h-3 w-3" />}</Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent><p>Snapshots</p></TooltipContent></Tooltip></TooltipProvider>
              <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Server Snapshots (Max: {MAX_SERVER_SNAPSHOTS})</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTimeout(handleCreateSnapshot,0)} disabled={createSnapshotButtonDisabled}>{isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Create Snapshot</DropdownMenuItem>
                {serverSnapshots.length > 0 && (<> <DropdownMenuSeparator /> <DropdownMenuGroup><DropdownMenuLabel className="text-xs px-2">Recent ({serverSnapshots.length})</DropdownMenuLabel>{snapshotError && <DropdownMenuLabel className="text-xs px-2 text-destructive">{snapshotError}</DropdownMenuLabel>} {serverSnapshots.map(snapshot => (<DropdownMenuItem key={snapshot.id} className="flex justify-between items-center text-xs" onSelect={(e) => e.preventDefault()}><span onClick={() => handleLoadSnapshot(snapshot)} className="cursor-pointer flex-grow hover:text-primary truncate pr-2">{format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}</span><div className="flex items-center ml-1 gap-0.5 flex-shrink-0"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View"><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View Snapshot</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete Snapshot"><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider></div></DropdownMenuItem>))} </DropdownMenuGroup></>)}
                {serverSnapshots.length === 0 && !isLoadingSnapshots && !isCreatingSnapshot && !snapshotError && (<DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots.</DropdownMenuLabel>)}
              </DropdownMenuContent>
            </DropdownMenu>
            <span>Lang: {editorLanguage}</span> <span className="mx-1">|</span>
            <span>Chars: {fileContent.length}</span> <span className="mx-1">|</span>
            <span>Lines: {fileContent.split('\n').length}</span>
            {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">*</span>}
            {!isWritable && <span className="ml-2 font-semibold text-destructive">(Read-only)</span>}
          </div>
        </div>
        
        <div className={cn("flex-grow relative p-0 bg-background min-h-0", isDragging && "pointer-events-none")}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}
          {!isLoading && error && (
            <div className="p-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>
          )}
          {!isLoading && !error && !isWritable && (
            <div className="p-4"><Alert variant="destructive"><FileWarning className="h-4 w-4" /><ShadcnAlertTitle>Read-only Mode</ShadcnAlertTitle><AlertDescription>This file is not writable. Changes cannot be saved.</AlertDescription></Alert></div>
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
              <div className="flex items-center justify-between mb-1">
                 {/* Removed "Find in File" title */}
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => setIsSearchWidgetOpen(false)}><X className="h-3 w-3" /></Button>
              </div>
              <Input id="find-query-widget" value={searchQuery} onChange={handleSearchInputChange} placeholder="Search..." className="h-7 text-xs px-2 py-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) performSearch(searchQuery, isCaseSensitiveSearch); }}/>
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-0.5">
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0}><ChevronUp className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Previous</p></TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0}><ChevronDown className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Next</p></TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" variant={isCaseSensitiveSearch ? "secondary" : "ghost"} size="icon" className="h-6 w-6" onClick={toggleCaseSensitiveSearch}><CaseSensitive className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Case Sensitive ({isCaseSensitiveSearch ? "On" : "Off"})</p></TooltipContent></Tooltip></TooltipProvider>
                </div>
                <span className="text-xs text-muted-foreground px-1 truncate">{searchMatches.length > 0 ? `${currentMatchIndex + 1} of ${searchMatches.length}` : searchQuery.trim() ? "No matches" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {PRESET_SEARCH_TERMS.map(term => (
                  <Button key={term} variant="outline" size="xs" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button>
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
      </DialogContent>
    </Dialog>
  );
}

    