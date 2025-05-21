
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
import CodeEditor from '@/components/ui/code-editor';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
  Camera,
  Search as SearchIconLucide, // Aliased to avoid conflict
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
  ArrowLeft, // For file tree back button
  Folder as FolderIcon,
  FileText as FileTextIcon,
  FileCode2 as FileCode2Icon,
  FileJson as FileJsonIcon,
  ServerCog as ServerCogIcon,
  ImageIcon as ImageIconLucide,
  Archive as ArchiveIcon,
  Shell as ShellIcon,
  FileTerminal as FileTerminalIcon,
  AudioWaveform as AudioWaveformIcon,
  VideoIcon as VideoIconLucide,
  Database as DatabaseIcon,
  List as ListIcon,
  Shield as ShieldIcon,
  Github as GithubIcon,
  File as FileIconDefault,
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
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface FileItem { // Simplified FileItem for the tree
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
}

interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null; // Initial file to open
}

const MAX_SERVER_SNAPSHOTS = 10;
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];

// Replicated getLanguageFromFilename
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

// Replicated getFileIcon
function getFileIcon(filename: string, fileType: FileItem['type']): React.ReactNode {
  if (fileType === 'folder') return <FolderIcon className="h-4 w-4 text-primary shrink-0" />;
  if (fileType === 'link') return <FileIconDefault className="h-4 w-4 text-purple-400 shrink-0" />;
  if (fileType === 'unknown') return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;

  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.json': return <FileJsonIcon className="h-4 w-4 text-yellow-600 shrink-0" />;
    case '.yaml': case '.yml': return <ServerCogIcon className="h-4 w-4 text-indigo-400 shrink-0" />;
    case '.html': case '.htm': return <FileCode2Icon className="h-4 w-4 text-orange-500 shrink-0" />;
    case '.css': case '.scss': case '.sass': return <FileCode2Icon className="h-4 w-4 text-blue-500 shrink-0" />;
    case '.js': case '.jsx': case '.ts': case '.tsx': return <FileCode2Icon className="h-4 w-4 text-yellow-500 shrink-0" />;
    case '.txt': case '.md': case '.log': return <FileTextIcon className="h-4 w-4 text-gray-500 shrink-0" />;
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.svg': case '.webp': case '.ico': return <ImageIconLucide className="h-4 w-4 text-purple-500 shrink-0" />;
    case '.zip': case '.tar': case '.gz': case '.rar': case '.7z': return <ArchiveIcon className="h-4 w-4 text-amber-700 shrink-0" />;
    case '.sh': case '.bash': return <ShellIcon className="h-4 w-4 text-green-600 shrink-0" />;
    case '.bat': case '.cmd': return <FileTerminalIcon className="h-4 w-4 text-gray-700 shrink-0" />;
    case '.mp3': case '.wav': case '.ogg': return <AudioWaveformIcon className="h-4 w-4 text-pink-500 shrink-0" />;
    case '.mp4': case '.mov': case '.avi': case '.mkv': return <VideoIconLucide className="h-4 w-4 text-red-500 shrink-0" />;
    case '.db': case '.sqlite': case '.sql': return <DatabaseIcon className="h-4 w-4 text-indigo-500 shrink-0" />;
    case '.csv': case '.xls': case '.xlsx': return <ListIcon className="h-4 w-4 text-green-700 shrink-0" />;
    case '.exe': case '.dmg': case '.app': return <FileTextIcon className="h-4 w-4 text-gray-800 shrink-0" />; // Changed from Settings2
    case '.pem': case '.crt': case '.key': return <ShieldIcon className="h-4 w-4 text-teal-500 shrink-0" />;
    case '.gitignore': case '.gitattributes': case '.gitmodules': return <GithubIcon className="h-4 w-4 text-neutral-700 shrink-0" />;
    default: return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}


export default function EditorDialog({ isOpen, onOpenChange, filePathToEdit }: EditorDialogProps) {
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // State for the main editor
  const [currentFileInEditorPath, setCurrentFileInEditorPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalFileContent, setOriginalFileContent] = useState<string>('');
  const [isWritable, setIsWritable] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorLanguage, setEditorLanguage] = useState<string>('plaintext');

  // State for File Tree Sidebar
  const [fileTreePath, setFileTreePath] = useState<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItem[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);

  // Existing states for Snapshots, Find, Dialog, etc.
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

  const fileName = useMemo(() => path.basename(currentFileInEditorPath || 'Untitled'), [currentFileInEditorPath]);
  const hasUnsavedChanges = useMemo(() => fileContent !== originalFileContent, [fileContent, originalFileContent]);

  const resetEditorState = useCallback(() => {
    console.log("[EditorDialog] resetEditorState called");
    setCurrentFileInEditorPath(null);
    setFileContent('');
    setOriginalFileContent('');
    setIsWritable(true);
    setEditorError(null);
    setEditorLanguage('plaintext');
    setServerSnapshots([]);
    setSnapshotError(null);
    setIsSearchWidgetOpen(false);
    setSearchQuery("");
    setCurrentMatchIndex(-1);
    setSearchMatches([]);
    // Reset file tree states
    setFileTreePath('/');
    setFileTreeItems([]);
    setIsFileTreeLoading(false);
    setFileTreeError(null);
  }, []);

  const fetchFileContentAndSettings = useCallback(async (filePathToLoad: string) => {
    if (!filePathToLoad) {
      setIsLoading(false);
      return;
    }
    console.log(`[EditorDialog] fetchFileContentAndSettings called for: ${filePathToLoad}`);
    setIsLoading(true);
    setEditorError(null);
    setSnapshotError(null); // Also clear snapshot error when loading new file
    setServerSnapshots([]); // Clear old snapshots

    try {
      const settingsResult = await loadPanelSettings();
      setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);

      const currentFileLang = getLanguageFromFilename(filePathToLoad);
      setEditorLanguage(currentFileLang);

      const response = await fetch(`/api/panel-daemon/file?path=${encodeURIComponent(filePathToLoad)}&view=true`);
      if (!response.ok) {
        const errText = await response.text();
        let data;
        try { data = errText ? JSON.parse(errText) : { error: `HTTP error ${response.status}` }; }
        catch (parseError) { data = { error: `Failed to parse error response: ${errText.substring(0,100)}... Status: ${response.status}`}; }
        throw new Error(data.error || data.details || data.message || `Failed to fetch file. Status: ${response.status}`);
      }
      const data = await response.json();
      if (typeof data.writable !== 'boolean' || typeof data.content !== 'string') {
        throw new Error("Invalid response from server: missing 'writable' or 'content'.");
      }

      setIsWritable(data.writable);
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      await fetchSnapshots(filePathToLoad);
    } catch (e: any) {
      setEditorError(e.message || "An unexpected error occurred while fetching file content.");
      setFileContent(''); // Clear content on error
      setOriginalFileContent('');
      setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed fetchSnapshots from here, will be called separately

  const fetchSnapshots = useCallback(async (currentFilePath: string) => {
    if (!currentFilePath) return;
    console.log(`[EditorDialog] fetchSnapshots called for: ${currentFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentFilePath)}`);
      if (!response.ok) {
        let errData;
        try { const text = await response.text(); errData = text ? JSON.parse(text) : { error: `Failed to fetch snapshots. Status: ${response.status}` }; }
        catch { errData = { error: `Failed to fetch snapshots. Status: ${response.status}` }; }
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

  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!pathToDisplay) return;
    console.log(`[EditorDialog] fetchFileTreeItems called for path: ${pathToDisplay}`);
    setIsFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToDisplay)}`);
      if (!response.ok) {
        let errData;
        try { const text = await response.text(); errData = text ? JSON.parse(text) : { error: `Failed to list directory. Status: ${response.status}` }; }
        catch { errData = { error: `Failed to list directory. Status: ${response.status}` }; }
        throw new Error(errData.error || `Failed to list directory. Status: ${response.status}`);
      }
      const data = await response.json();
      setFileTreeItems(Array.isArray(data.files) ? data.files : []);
      setFileTreePath(data.path || pathToDisplay); // Ensure fileTreePath is updated if API normalizes it
    } catch (e: any) {
      setFileTreeError(e.message || "An error occurred fetching directory listing.");
      setFileTreeItems([]);
    } finally {
      setIsFileTreeLoading(false);
    }
  }, []);

  // Effect to initialize or reset when filePathToEdit prop changes
  useEffect(() => {
    console.log(`[EditorDialog] useEffect for filePathToEdit. isOpen: ${isOpen}, filePathToEdit: ${filePathToEdit}`);
    if (isOpen && filePathToEdit) {
      setCurrentFileInEditorPath(filePathToEdit);
      const initialDir = path.dirname(filePathToEdit);
      setFileTreePath(initialDir === '.' ? '/' : initialDir); // Handle root files

      // Reset other states
      setFileContent('');
      setOriginalFileContent('');
      setEditorLanguage('plaintext');
      setServerSnapshots([]);
      setIsSearchWidgetOpen(false);
      // Maximize logic
      if (!isMaximized) {
        const defaultWidth = Math.min(window.innerWidth * 0.9, 1200); // Wider default
        const defaultHeight = Math.min(window.innerHeight * 0.85, 900);
        setPosition({
          x: Math.max(0, window.innerWidth / 2 - defaultWidth / 2),
          y: Math.max(0, window.innerHeight / 2 - defaultHeight / 2)
        });
      }
    } else if (!isOpen) {
      resetEditorState();
    }
  }, [isOpen, filePathToEdit, isMaximized, resetEditorState]);

  // Effect to load main editor content when currentFileInEditorPath changes
  useEffect(() => {
    if (currentFileInEditorPath && isOpen) {
      console.log(`[EditorDialog] useEffect for currentFileInEditorPath: ${currentFileInEditorPath}. Fetching content and snapshots.`);
      fetchFileContentAndSettings(currentFileInEditorPath);
      // Snapshots are now specific to the current file in editor
      fetchSnapshots(currentFileInEditorPath);
    }
  }, [currentFileInEditorPath, isOpen, fetchFileContentAndSettings, fetchSnapshots]);

  // Effect to load file tree items when fileTreePath changes
  useEffect(() => {
    if (fileTreePath && isOpen) {
      console.log(`[EditorDialog] useEffect for fileTreePath: ${fileTreePath}. Fetching tree items.`);
      fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems]);

  // Toast effects
  useEffect(() => {
    if (editorError) { setTimeout(() => toast({ title: "File Operation Error", description: editorError, variant: "destructive" }), 0); }
  }, [editorError, toast]);
  useEffect(() => {
    if (snapshotError) { setTimeout(() => toast({ title: "Snapshot Operation Error", description: snapshotError, variant: "destructive" }), 0); }
  }, [snapshotError, toast]);
  useEffect(() => {
    if (fileTreeError) { setTimeout(() => toast({ title: "File Tree Error", description: fileTreeError, variant: "destructive" }), 0); }
  }, [fileTreeError, toast]);


  const handleCreateSnapshot = useCallback(async () => {
    if (!currentFileInEditorPath) return;
    setIsCreatingSnapshot(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentFileInEditorPath, content: fileContent, language: editorLanguage }),
      });
      const result = await response.json();
      if (!response.ok) { throw new Error(result.error || result.details || 'Failed to create snapshot.'); }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${path.basename(currentFileInEditorPath)} created.` }),0);
      setServerSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []);
    } catch (e: any) {
      const errorMsg = e.message || "An unexpected error occurred while creating snapshot.";
      setSnapshotError(errorMsg);
      setTimeout(() => toast({ title: "Snapshot Creation Error", description: errorMsg, variant: "destructive" }),0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [currentFileInEditorPath, fileContent, editorLanguage, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (!currentFileInEditorPath || !isWritable) {
      setTimeout(() => toast({ title: "Cannot Save", description: !currentFileInEditorPath ? "No active file." : "File not writable.", variant: "destructive" }),0);
      return;
    }
    if (hasUnsavedChanges) { await handleCreateSnapshot(); }
    setIsSaving(true);
    setEditorError(null);
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFileInEditorPath, content: fileContent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to save file.');
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${path.basename(currentFileInEditorPath)} saved.` }),0);
      setOriginalFileContent(fileContent);
    } catch (e: any) {
      setEditorError(e.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  }, [currentFileInEditorPath, fileContent, isWritable, hasUnsavedChanges, toast, handleCreateSnapshot]);

  useEffect(() => {
    const canSave = isOpen && !isSaving && isWritable && (hasUnsavedChanges || globalDebugModeActive);
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (canSave) { handleSaveChanges(); }
      }
    };
    if (isOpen) { window.addEventListener('keydown', handleKeyDown); }
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, isSaving, isWritable, hasUnsavedChanges, globalDebugModeActive, handleSaveChanges]);

  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
    setTimeout(() => {
      setFileContent(snapshotToLoad.content);
      setOriginalFileContent(snapshotToLoad.content);
      setEditorLanguage(snapshotToLoad.language);
      toast({ title: "Snapshot Loaded", description: `Loaded snapshot for ${path.basename(currentFileInEditorPath || '')} from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}` });
    },0);
  }, [toast, currentFileInEditorPath]);

  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    // Placeholder: Server-side logic needed for persistence
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s));
    setTimeout(() => toast({ title: "Snapshot Lock Toggled (Client)", description: "Server-side persistence is not yet implemented." }),0);
  }, [toast]);

  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    // Placeholder: Server-side logic needed for persistence
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
    setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion is not yet implemented."}), 0);
  }, [toast]);

  const handleViewSnapshotInPopup = (snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };

  const performSearch = useCallback((query: string, caseSensitive: boolean) => {
    if (!editorRef.current?.view || !query.trim()) {
      setSearchMatches([]); setCurrentMatchIndex(-1); return;
    }
    const view = editorRef.current.view;
    const cursor = new SearchCursor(view.state.doc, query, 0, view.state.doc.length, caseSensitive ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase());
    const matchesFound: Array<{ from: number; to: number }> = [];
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
    if (isMaximized) { setPosition(prevPosition); }
    else {
      if (dialogContentRef.current) { const rect = dialogContentRef.current.getBoundingClientRect(); setPrevPosition({ x: rect.left, y: rect.top });}
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
      if (!window.confirm("You have unsaved changes. Are you sure you want to close? Changes will be lost.")) { return; }
    }
    if (isMaximized) setIsMaximized(false);
    onOpenChange(false); // This will trigger resetEditorState via useEffect on isOpen
  };

  // File Tree Logic
  const handleTreeFolderClick = (folderName: string) => {
    const newPath = path.join(fileTreePath, folderName);
    setFileTreePath(newPath);
  };
  const handleTreeFileClick = (fileNameInTree: string) => {
    const filePath = path.join(fileTreePath, fileNameInTree);
    setCurrentFileInEditorPath(filePath); // This will trigger the useEffect to load its content
  };
  const handleTreeBackClick = () => {
    // Prevent going above the initial directory of the originally opened file (filePathToEdit)
    const initialBaseDir = path.dirname(filePathToEdit || '/');
    if (fileTreePath === '/' || fileTreePath === initialBaseDir || (fileTreePath === '.' && initialBaseDir === '.')) {
        // Optionally show a toast or do nothing if already at the highest allowed level
        toast({ title: "Navigation Limit", description: "Cannot navigate above the initial file's directory.", duration: 2000});
        return;
    }
    const parentDir = path.dirname(fileTreePath);
    setFileTreePath(parentDir === '.' ? '/' : parentDir);
  };


  if (!isOpen) return null;

  const canGoBackInTree = useMemo(() => {
    if (!filePathToEdit) return false;
    const initialBaseDir = path.dirname(filePathToEdit);
    const normalizedInitialBase = path.normalize(initialBaseDir === '.' ? '/' : initialBaseDir);
    const normalizedFileTreePath = path.normalize(fileTreePath);
    return normalizedFileTreePath !== normalizedInitialBase && normalizedFileTreePath !== '/';
  }, [fileTreePath, filePathToEdit]);


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        className={cn(
          "p-0 flex flex-col shadow-2xl rounded-lg overflow-hidden transition-all duration-300 ease-in-out",
          isMaximized
            ? "w-screen h-screen max-w-full max-h-full !rounded-none"
            : "w-[95vw] max-w-6xl h-[90vh] max-h-[1000px]" // Wider and taller for tree view
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
            {fileName || 'File Editor'} <span className="text-xs text-muted-foreground font-normal ml-1 truncate">({currentFileInEditorPath})</span>
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

        <div className="flex-grow flex flex-row min-h-0"> {/* Main content area: Tree + Editor */}
          {/* File Tree Sidebar */}
          <div className={cn(
              "flex flex-col border-r bg-muted/40",
              isMaximized ? "w-64" : "w-56", // Slightly narrower when not maximized
              "flex-shrink-0"
            )}
          >
            <div className="flex items-center p-2 border-b flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={!canGoBackInTree} className="h-7 w-7 mr-1">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-medium truncate text-muted-foreground hover:text-foreground" title={fileTreePath}>
                  {fileTreePath}
                </span>
              </TooltipTrigger><TooltipContent><p>{fileTreePath}</p></TooltipContent></Tooltip></TooltipProvider>
            </div>
            <ScrollArea className="flex-grow p-1">
              {isFileTreeLoading && <div className="p-2 text-xs text-muted-foreground flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin mr-2"/>Loading tree...</div>}
              {fileTreeError && <div className="p-2 text-xs text-destructive"><AlertTriangle className="h-4 w-4 inline mr-1"/>{fileTreeError}</div>}
              {!isFileTreeLoading && !fileTreeError && fileTreeItems.length === 0 && <div className="p-2 text-xs text-center text-muted-foreground italic">Empty directory</div>}
              {!isFileTreeLoading && !fileTreeError && fileTreeItems.map(item => (
                <Button
                  key={item.name}
                  variant="ghost"
                  className="w-full justify-start h-7 px-2 py-1 text-xs font-normal truncate"
                  onClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(item.name)}
                  title={item.name}
                >
                  <span className="mr-1.5">{getFileIcon(item.name, item.type)}</span>
                  <span className="truncate">{item.name}</span>
                </Button>
              ))}
            </ScrollArea>
          </div>

          {/* Editor Pane */}
          <div className="flex-grow flex flex-col min-w-0"> {/* Added min-w-0 here */}
            <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
              {/* Toolbar items (Save, Find, etc.) */}
              <div className="flex items-center gap-1">
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSaveChanges} disabled={saveButtonDisabled} className="shadow-sm hover:scale-105">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="shadow-sm hover:scale-105"><SearchIconLucide className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Find</p></TooltipContent></Tooltip></TooltipProvider>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mr-1">
                 <DropdownMenu>
                   <TooltipProvider><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild disabled={isLoadingSnapshots || isCreatingSnapshot}><Button variant="ghost" size="icon" className="shadow-sm hover:scale-105 w-7 h-7">{isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="h-3 w-3 animate-spin"/> : <Camera className="h-3 w-3" />}</Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent><p>Snapshots</p></TooltipContent></Tooltip></TooltipProvider>
                   <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
                    <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Server Snapshots (Max: {MAX_SERVER_SNAPSHOTS}) for {path.basename(currentFileInEditorPath || "current file")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e) => {e.preventDefault(); setTimeout(handleCreateSnapshot,0)}} disabled={createSnapshotButtonDisabled}>{isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Create Snapshot</DropdownMenuItem>
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
              {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}
              {!isLoading && editorError && <div className="p-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{editorError}</AlertDescription></Alert></div>}
              {!isLoading && !editorError && !isWritable && <div className="p-4"><Alert variant="destructive"><FileWarning className="h-4 w-4" /><ShadcnAlertTitle>Read-only Mode</ShadcnAlertTitle><AlertDescription>This file is not writable. Changes cannot be saved.</AlertDescription></Alert></div>}
              {!isLoading && !editorError && currentFileInEditorPath && (
                <CodeEditor
                  ref={editorRef}
                  value={fileContent}
                  onChange={setFileContent}
                  language={editorLanguage}
                  readOnly={isSaving || !isWritable}
                  className="h-full w-full border-0 rounded-none"
                />
              )}
              {!isLoading && !editorError && !currentFileInEditorPath && (
                 <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">Select a file from the tree to view or edit.</div>
              )}

              {isSearchWidgetOpen && (
                <div className="absolute top-2 right-2 z-10 bg-card p-2 rounded-lg shadow-lg border w-60 space-y-1.5">
                  <div className="flex items-center justify-between mb-1"><Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => setIsSearchWidgetOpen(false)}><X className="h-3 w-3" /></Button></div>
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
                    {PRESET_SEARCH_TERMS.map(term => (<Button key={term} variant="outline" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button>))}
                  </div>
                </div>
              )}
            </div>
          </div>
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

    