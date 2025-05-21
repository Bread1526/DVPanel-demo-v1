
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter, // Keep for main dialog close if needed, or remove if only using X
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import { CodeEditor } from '@/components/ui/code-editor'; // Assuming this is the path
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
  Camera,
  Search as SearchIconLucide,
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
  ArrowLeft,
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
  FileX2
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

interface FileItem {
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
}

interface OpenedTabInfo {
  path: string;
  name: string;
  content: string | null;
  originalContent: string | null; // Content when opened or last saved
  language: string;
  unsavedChanges: boolean;
  isLoading: boolean; // For individual tab content loading
  isWritable: boolean | null; // Writable status from server
  error?: string | null; // Error specific to this tab's loading
}

interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null; // Path of the file to initially open
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
    case '.exe': case '.dmg': case '.app': return <FileTextIcon className="h-4 w-4 text-gray-800 shrink-0" />;
    case '.pem': case '.crt': case '.key': return <ShieldIcon className="h-4 w-4 text-teal-500 shrink-0" />;
    case '.gitignore': case '.gitattributes': case '.gitmodules': return <GithubIcon className="h-4 w-4 text-neutral-700 shrink-0" />;
    default: return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export default function EditorDialog({ isOpen, onOpenChange, filePathToEdit }: EditorDialogProps) {
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const activeTabPathRef = useRef<string | null>(null); // To handle async updates correctly

  // State for opened files/tabs
  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // State for the file tree sidebar
  const [fileTreePath, setFileTreePath] = useState<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItem[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);

  // General editor states (tied to the active tab)
  const [editorError, setEditorError] = useState<string | null>(null); // General error for the editor area
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Global settings and snapshot states (can be tied to active tab if needed, but simpler for now)
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  // Search widget states
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // Dialog dragging and maximizing states
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0 });
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // --- Derived State for Active Tab ---
  const activeTab = useMemo(() => {
    return openedTabs.find(tab => tab.path === activeTabPath) || null;
  }, [openedTabs, activeTabPath]);

  const editorContent = useMemo(() => activeTab?.content || "", [activeTab]);
  const editorLanguage = useMemo(() => activeTab?.language || "plaintext", [activeTab]);
  const hasUnsavedChanges = useMemo(() => activeTab?.unsavedChanges || false, [activeTab]);
  const isEditorLoading = useMemo(() => activeTab?.isLoading || false, [activeTab]);
  const isCurrentFileWritable = useMemo(() => activeTab?.isWritable ?? true, [activeTab]); // Default to true until fetched

  // Effect to update activeTabPathRef for async operations
  useEffect(() => {
    activeTabPathRef.current = activeTabPath;
  }, [activeTabPath]);

  // Initial setup when dialog opens or filePathToEdit changes
  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Initialization useEffect - isOpen:", isOpen, "filePathToEdit:", filePathToEdit);
    if (isOpen) {
      loadPanelSettings().then(settingsResult => {
        setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);
      });

      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit);
        setFileTreePath(initialDir === '.' || initialDir === '/' ? '/' : initialDir);
        handleOpenOrActivateTab(filePathToEdit, path.basename(filePathToEdit));
      } else {
        // If no file path, reset tabs and active path
        setOpenedTabs([]);
        setActiveTabPath(null);
        setFileTreePath('/');
      }
      
      setIsSearchWidgetOpen(false);
      setSearchQuery("");
      setSearchMatches([]);
      setCurrentMatchIndex(-1);

      if (!isMaximized) {
        const defaultWidth = Math.min(window.innerWidth * 0.9, 1200);
        const defaultHeight = Math.min(window.innerHeight * 0.85, 900);
        setPosition({
          x: Math.max(0, window.innerWidth / 2 - defaultWidth / 2),
          y: Math.max(0, window.innerHeight / 2 - defaultHeight / 2)
        });
      }
    } else { // Dialog is closing
      setOpenedTabs([]); // Clear tabs when dialog closes
      setActiveTabPath(null);
      setServerSnapshots([]);
      setFileTreePath('/');
      // Reset other relevant states if necessary
    }
  }, [isOpen, filePathToEdit, isMaximized, globalDebugModeActive]); // Removed handleOpenOrActivateTab from here

  // Fetch file tree items when fileTreePath changes
  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!pathToDisplay || !isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems called for path: ${pathToDisplay}`);
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
      setFileTreePath(data.path || pathToDisplay);
    } catch (e: any) {
      setFileTreeError(e.message || "An error occurred fetching directory listing.");
      setFileTreeItems([]);
    } finally {
      setIsFileTreeLoading(false);
    }
  }, [isOpen, globalDebugModeActive]);

  useEffect(() => {
    if (fileTreePath && isOpen) {
      fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems]);


  // Fetch content for the active tab if needed
  const fetchTabContent = useCallback(async (tabPath: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchTabContent called for: ${tabPath}`);
    setEditorError(null); // Clear general editor error

    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === tabPath ? { ...tab, isLoading: true, error: null } : tab
    ));

    try {
      const response = await fetch(`/api/panel-daemon/file?path=${encodeURIComponent(tabPath)}&view=true`);
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

      if (activeTabPathRef.current === tabPath) { // Ensure this tab is still active
        setOpenedTabs(prevTabs => prevTabs.map(tab => 
          tab.path === tabPath ? { 
            ...tab, 
            content: data.content, 
            originalContent: data.content,
            isWritable: data.writable, 
            isLoading: false,
            unsavedChanges: false // Reset unsaved changes on fresh load
          } : tab
        ));
        fetchSnapshots(tabPath); // Fetch snapshots for the newly loaded content
      }
    } catch (e: any) {
      const errorMsg = e.message || "An unexpected error occurred while fetching file content.";
      if (activeTabPathRef.current === tabPath) {
        setOpenedTabs(prevTabs => prevTabs.map(tab => 
          tab.path === tabPath ? { ...tab, error: errorMsg, isLoading: false, content: "", originalContent: "" } : tab
        ));
        setEditorError(errorMsg); // Show general error as well
      }
      setTimeout(() => toast({ title: "File Load Error", description: errorMsg, variant: "destructive" }), 0);
    }
  }, [globalDebugModeActive, toast]); // Removed fetchSnapshots from here

  useEffect(() => {
    if (activeTabPath && activeTab) {
      if (activeTab.content === null && !activeTab.isLoading) { // Only fetch if content is null and not already loading
        fetchTabContent(activeTabPath);
      }
      if(activeTab.content !== null) { // If content is already loaded, fetch snapshots
        fetchSnapshots(activeTabPath);
      }
    }
  }, [activeTabPath, activeTab, fetchTabContent]); // Removed fetchSnapshots from here

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab: filePath=${filePath}, fileName=${fileName}`);
    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      let newTabs;
      if (existingTabIndex !== -1) {
        // Tab exists, move it to the end (most recent)
        const existingTab = prevTabs[existingTabIndex];
        newTabs = [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
      } else {
        // New tab
        const newTab: OpenedTabInfo = {
          path: filePath,
          name: fileName,
          content: null, // Will be fetched by useEffect
          originalContent: null,
          language: getLanguageFromFilename(fileName),
          unsavedChanges: false,
          isLoading: true, // Set to true to trigger fetch
          isWritable: null,
          error: null,
        };
        newTabs = [...prevTabs, newTab];
      }
      return newTabs;
    });
    setActiveTabPath(filePath);
  }, [globalDebugModeActive]);


  // --- Existing Snapshot, Search, Dialog Drag/Maximize logic ---
  // (Slightly adapted to work with activeTab context)

  const fetchSnapshots = useCallback(async (currentFilePath: string) => {
    if (!currentFilePath || !isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots called for: ${currentFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentFilePath)}`);
      if (!response.ok) {
        const errorText = await response.text();
        const errData = errorText ? JSON.parse(errorText) : { error: `Failed to fetch snapshots. Status: ${response.status}` };
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
  }, [isOpen, globalDebugModeActive]);

  const handleCreateSnapshot = useCallback(async () => {
    if (!activeTabPath || !activeTab || activeTab.content === null) return;
    if (globalDebugModeActive) console.log("[EditorDialog] handleCreateSnapshot called for", activeTabPath);
    setIsCreatingSnapshot(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: activeTabPath, content: activeTab.content, language: activeTab.language }),
      });
      const result = await response.json();
      if (!response.ok) { throw new Error(result.error || result.details || 'Failed to create snapshot.'); }
      
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${activeTab.name} created.` }),0);
      setServerSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []); // Update from server response
    } catch (e: any) {
      const errorMsg = e.message || "An unexpected error occurred while creating snapshot.";
      setSnapshotError(errorMsg);
       setTimeout(() => toast({ title: "Snapshot Creation Error", description: errorMsg, variant: "destructive" }),0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [activeTabPath, activeTab, toast, globalDebugModeActive]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    if (!activeTabPath) return;
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === activeTabPath 
        ? { 
            ...tab, 
            content: newContent, 
            unsavedChanges: newContent !== tab.originalContent 
          } 
        : tab
    ));
  }, [activeTabPath]);

  const handleSaveChanges = useCallback(async () => {
    if (!activeTab || !activeTab.isWritable || activeTab.content === null) {
      setTimeout(() => toast({ title: "Cannot Save", description: !activeTab ? "No active file." : "File not writable or content not loaded.", variant: "destructive" }),0);
      return;
    }
    if (activeTab.unsavedChanges) { await handleCreateSnapshot(); } // Snapshot before save if changes exist

    setIsSaving(true);
    setEditorError(null);
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeTab.path, content: activeTab.content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to save file.');
      
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${activeTab.name} saved.` }),0);
      setOpenedTabs(prevTabs => prevTabs.map(tab => 
        tab.path === activeTab.path 
          ? { ...tab, originalContent: tab.content, unsavedChanges: false } 
          : tab
      ));
    } catch (e: any) {
      const errorMsg = e.message || "An unexpected error occurred while saving.";
      setEditorError(errorMsg);
      setTimeout(() => toast({ title: "Save Error", description: errorMsg, variant: "destructive" }),0);
    } finally {
      setIsSaving(false);
    }
  }, [activeTab, toast, handleCreateSnapshot]);

  // Keyboard shortcut for Save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const canSave = isOpen && !isSaving && isCurrentFileWritable && (hasUnsavedChanges || globalDebugModeActive);
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (canSave) { handleSaveChanges(); }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        if (activeTabPath && editorRef.current?.view) {
          setIsSearchWidgetOpen(prev => !prev);
        }
      }
    };
    if (isOpen) { window.addEventListener('keydown', handleKeyDown); }
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, isSaving, isCurrentFileWritable, hasUnsavedChanges, globalDebugModeActive, handleSaveChanges, activeTabPath]);

  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
    if (!activeTabPath) return;
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === activeTabPath 
        ? { 
            ...tab, 
            content: snapshotToLoad.content, 
            originalContent: snapshotToLoad.content, // Consider this the new original
            language: snapshotToLoad.language, // Update language from snapshot
            unsavedChanges: false 
          } 
        : tab
    ));
    setTimeout(() => toast({ title: "Snapshot Loaded", description: `Loaded snapshot for ${activeTab?.name || ''} from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')}` }),0);
  }, [activeTabPath, activeTab?.name, toast]);
  
  const handleCloseTab = useCallback((pathToClose: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); // Prevent tab activation if clicking close icon

    const tabToClose = openedTabs.find(tab => tab.path === pathToClose);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`File "${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
        return;
      }
    }

    let newActiveTabPath: string | null = null;
    const remainingTabs = openedTabs.filter(tab => tab.path !== pathToClose);

    if (activeTabPath === pathToClose) { // If closing the active tab
      if (remainingTabs.length > 0) {
        // Try to activate the tab that was to the left, or the new last tab
        const closingTabIndex = openedTabs.findIndex(tab => tab.path === pathToClose);
        const newIndexToActivate = Math.max(0, Math.min(closingTabIndex -1, remainingTabs.length -1));
        newActiveTabPath = remainingTabs[newIndexToActivate]?.path || null;
      }
    } else { // Closing an inactive tab, keep current active tab
      newActiveTabPath = activeTabPath;
    }
    
    setOpenedTabs(remainingTabs);
    setActiveTabPath(newActiveTabPath);

    if (remainingTabs.length === 0) {
      // Optionally close dialog if no tabs are left, or handle as needed
      // onOpenChange(false); // Example: close dialog if all tabs closed
    }
  }, [openedTabs, activeTabPath, toast]); // Removed onOpenChange for now

  // Snapshot management UI helpers (lock, delete) - using client-side logic for now
  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s));
    setTimeout(() => toast({ title: "Snapshot Lock Toggled (Client)", description: "Server-side persistence for lock not yet implemented." }),0);
  }, [toast]);

  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
     setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion for snapshots is not yet implemented."}), 0);
  }, [toast]);

  const handleViewSnapshotInPopup = (snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };
  
  // Search widget functions
  const performSearch = useCallback((query: string, caseSensitive: boolean) => {
    if (!editorRef.current?.view || !query.trim()) {
      setSearchMatches([]); setCurrentMatchIndex(-1); return;
    }
    const view = editorRef.current.view;
    const cursor = new SearchCursor(view.state.doc, query, 0, view.state.doc.length, caseSensitive ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase());
    const localMatchesFound: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) { localMatchesFound.push({ from: cursor.value.from, to: cursor.value.to }); }
    setSearchMatches(localMatchesFound);
    if (localMatchesFound.length > 0) {
      setCurrentMatchIndex(0);
      goToMatch(0, localMatchesFound); 
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

  const goToMatch = useCallback((index: number, matchesToUse?: Array<{ from: number; to: number }>) => {
    const currentSearchMatches = matchesToUse || searchMatches; 
    if (editorRef.current?.view && currentSearchMatches[index]) {
      const match = currentSearchMatches[index];
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
    if (!isSearchWidgetOpen) {
      if (searchMatches.length > 0) {
        if (globalDebugModeActive) console.log("[EditorDialog] Search widget cleanup: Closing widget, clearing matches.");
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
        if (editorRef.current?.view) {
          const view = editorRef.current.view;
          if (view.state.selection.main.from !== view.state.selection.main.to) {
            view.dispatch({ selection: EditorSelection.single(view.state.selection.main.anchor) });
          }
        }
      }
    }
  }, [isSearchWidgetOpen, searchMatches.length, globalDebugModeActive]);
  
  // Dialog dragging and maximizing
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

  const saveButtonDisabled = isSaving || !isCurrentFileWritable || (!hasUnsavedChanges && !globalDebugModeActive) || !activeTab;
  const createSnapshotButtonDisabled = isCreatingSnapshot || isLoadingSnapshots || (!globalDebugModeActive && !hasUnsavedChanges) || !activeTab;

  const handleCloseDialog = () => {
    const anyUnsaved = openedTabs.some(tab => tab.unsavedChanges);
    if (anyUnsaved) {
      if (!window.confirm("You have unsaved changes in one or more tabs. Are you sure you want to close? Changes will be lost.")) { return; }
    }
    if (isMaximized) setIsMaximized(false); // Reset maximize state on close
    onOpenChange(false); 
  };
  
  // File tree sidebar logic
  const handleTreeFolderClick = (folderName: string) => {
    const newPath = path.join(fileTreePath, folderName);
    setFileTreePath(newPath);
  };

  const handleTreeFileClick = (fileNameInTree: string) => {
    const filePath = path.join(fileTreePath, fileNameInTree);
    handleOpenOrActivateTab(filePath, fileNameInTree);
  };

  const handleTreeBackClick = useCallback(() => {
    if (fileTreePath === '/') {
      setTimeout(() => toast({ title: "Navigation Limit", description: "Already at root.", duration: 2000}),0);
      return;
    }
    const parentDir = path.dirname(fileTreePath);
    setFileTreePath(parentDir === '.' ? '/' : parentDir);
  }, [fileTreePath, toast]);

  const canGoBackInTree = useMemo(() => fileTreePath !== '/', [fileTreePath]);

  // Render logic
  if (!isOpen) return null;

  const currentActiveTab = openedTabs.find(t => t.path === activeTabPath);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        className={cn(
          "p-0 flex flex-col shadow-2xl rounded-lg overflow-hidden transition-all duration-300 ease-in-out",
          isMaximized
            ? "w-screen h-screen max-w-full max-h-full !rounded-none"
            : "w-[95vw] max-w-6xl h-[90vh] max-h-[1000px]"
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
            File Editor
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

        {/* Tab Bar */}
        <ScrollArea className="flex-shrink-0 bg-muted/50 border-b whitespace-nowrap no-scrollbar">
          <div className="flex items-center p-1.5 space-x-1">
            {openedTabs.map(tab => (
              <Button
                key={tab.path}
                variant={activeTabPath === tab.path ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 px-3 text-xs font-medium relative group",
                   activeTabPath === tab.path ? "shadow-sm bg-background text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setActiveTabPath(tab.path)}
                title={tab.path}
              >
                {getFileIcon(tab.name, 'file')} 
                <span className="ml-1.5 truncate max-w-[150px]">{tab.name}</span>
                {tab.unsavedChanges && <span className="ml-1 text-amber-500 font-bold">*</span>}
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 ml-1.5 opacity-50 group-hover:opacity-100 absolute right-0.5 top-1/2 -translate-y-1/2"
                    onClick={(e) => handleCloseTab(tab.path, e)}
                >
                    <FileX2 className="h-3.5 w-3.5" />
                </Button>
              </Button>
            ))}
            {openedTabs.length === 0 && (
              <div className="px-3 py-1 text-xs text-muted-foreground italic">No files open. Double-click a file in the main manager to open it.</div>
            )}
          </div>
        </ScrollArea>

        <div className="flex-grow flex flex-row min-h-0"> {/* Main content area (tree + editor) */}
          {/* File Tree Sidebar */}
          <div className={cn(
              "flex flex-col border-r bg-muted/40",
              isMaximized ? "w-64" : "w-60", // Slightly smaller sidebar
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
          <div className="flex-grow flex flex-col min-w-0">
            {/* Editor Toolbar */}
            {activeTab && (
              <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
                <div className="flex items-center gap-1">
                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSaveChanges} disabled={saveButtonDisabled} className="shadow-sm hover:scale-105">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>
                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="shadow-sm hover:scale-105" disabled={!activeTab}><SearchIconLucide className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Find (Ctrl+F)</p></TooltipContent></Tooltip></TooltipProvider>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <span className="truncate max-w-[200px] sm:max-w-[300px] hover:text-foreground cursor-default" title={activeTab.path}>{activeTab.path}</span>
                  </TooltipTrigger><TooltipContent><p>{activeTab.path}</p></TooltipContent></Tooltip></TooltipProvider>
                  <span className="mx-1">|</span>
                  <span>Lang: {activeTab.language}</span> <span className="mx-1">|</span>
                  <span>Chars: {activeTab.content?.length || 0}</span> <span className="mx-1">|</span>
                  <span>Lines: {activeTab.content?.split('\n').length || 0}</span>
                  {activeTab.unsavedChanges && <span className="ml-1 font-semibold text-amber-500">*</span>}
                  {activeTab.isWritable === false && <span className="ml-2 font-semibold text-destructive">(Read-only)</span>}
                   <DropdownMenu>
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild disabled={isLoadingSnapshots || isCreatingSnapshot || !activeTab}>
                            <Button variant="ghost" size="icon" className="shadow-sm hover:scale-105 w-7 h-7 ml-1">{isLoadingSnapshots || isCreatingSnapshot ? <Loader2 className="h-3 w-3 animate-spin"/> : <Camera className="h-3 w-3" />}</Button>
                        </DropdownMenuTrigger>
                     </TooltipTrigger><TooltipContent><p>Snapshots</p></TooltipContent></TooltipProvider>
                     <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
                      <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Server Snapshots (Max: {MAX_SERVER_SNAPSHOTS}) for {activeTab?.name || "current file"}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={(e) => {e.preventDefault(); setTimeout(handleCreateSnapshot,0)}} disabled={createSnapshotButtonDisabled}>{isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Create Snapshot</DropdownMenuItem>
                      {serverSnapshots.length > 0 && (<> <DropdownMenuSeparator /> <DropdownMenuGroup><DropdownMenuLabel className="text-xs px-2">Recent ({serverSnapshots.length})</DropdownMenuLabel>{snapshotError && <DropdownMenuLabel className="text-xs px-2 text-destructive">{snapshotError}</DropdownMenuLabel>} {serverSnapshots.map(snapshot => (<DropdownMenuItem key={snapshot.id} className="flex justify-between items-center text-xs" onSelect={(e) => e.preventDefault()}><span onClick={() => handleLoadSnapshot(snapshot)} className="cursor-pointer flex-grow hover:text-primary truncate pr-2">{format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}</span><div className="flex items-center ml-1 gap-0.5 flex-shrink-0"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View"><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View Snapshot</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete Snapshot"><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider></div></DropdownMenuItem>))} </DropdownMenuGroup></>)}
                      {serverSnapshots.length === 0 && !isLoadingSnapshots && !isCreatingSnapshot && !snapshotError && (<DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots for this file.</DropdownMenuLabel>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}

            {/* Editor Content Area */}
            <div className={cn("flex-grow relative p-0 bg-background min-h-0", isDragging && "pointer-events-none")}>
              {!activeTab && (
                 <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">Select a file from the tree or open a new tab.</div>
              )}
              {activeTab && isEditorLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}
              {activeTab && !isEditorLoading && activeTab.error && <div className="p-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{activeTab.error}</AlertDescription></Alert></div>}
              {activeTab && !isEditorLoading && !activeTab.error && activeTab.isWritable === false && (
                <div className="p-4 flex-shrink-0"><Alert variant="destructive"><FileWarning className="h-4 w-4" /><ShadcnAlertTitle>Read-only Mode</ShadcnAlertTitle><AlertDescription>This file is not writable. Changes cannot be saved.</AlertDescription></Alert></div>
              )}
              {activeTab && !isEditorLoading && !activeTab.error && (
                <CodeEditor
                  ref={editorRef}
                  value={editorContent} // Derived from activeTab.content
                  onChange={handleEditorContentChange}
                  language={editorLanguage} // Derived from activeTab.language
                  readOnly={isSaving || !isCurrentFileWritable}
                  className="h-full w-full border-0 rounded-none" // Ensure CodeEditor fills its container
                />
              )}

              {/* Search Widget */}
              {isSearchWidgetOpen && activeTab && (
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

    