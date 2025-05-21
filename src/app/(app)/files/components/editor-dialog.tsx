
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor';
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

interface FileItemForTree {
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
}

interface OpenedTabInfo {
  path: string;
  name: string;
  content: string | null;
  originalContent: string | null;
  language: string;
  unsavedChanges: boolean;
  isLoading: boolean;
  isWritable: boolean | null; // null initially, then true/false
  error?: string | null;
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

function getFileIcon(filename: string, fileType: FileItemForTree['type']): React.ReactNode {
  if (fileType === 'folder') return <FolderIcon className="h-4 w-4 text-primary shrink-0" />;
  if (fileType === 'link') return <FileIconDefault className="h-4 w-4 text-purple-400 shrink-0" />; // Example for symlinks
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

  // --- Primary state for editor tabs and content ---
  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null); // To track active tab for async operations

  // --- State for the file tree sidebar ---
  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);

  // --- State for saving and snapshots ---
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  // --- State for auxiliary dialogs and UI features ---
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // --- State for dialog dragging and maximizing ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0 });
  const dialogContentRef = useRef<HTMLDivElement>(null);

  // --- Debug Logging ---
  useEffect(() => {
    if (globalDebugModeActive) {
      console.log("[EditorDialog] RENDER CYCLE", {
        isOpen,
        filePathToEdit,
        activeTabPath,
        openedTabsCount: openedTabs.length,
        fileTreePath,
        fileTreeItemsCount: fileTreeItems.length,
        isFileTreeLoading,
      });
    }
  }); // Log on every render if debug mode is on


  // Update activeTabPathRef whenever activeTabPath changes
  useEffect(() => {
    activeTabPathRef.current = activeTabPath;
    if (globalDebugModeActive) console.log(`[EditorDialog] activeTabPathRef updated to: ${activeTabPath}`);
  }, [activeTabPath, globalDebugModeActive]);

  const setActiveTabPath = useCallback((newPath: string | null) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] setActiveTabPath called with: ${newPath}`);
    setActiveTabPathInternal(newPath);
  }, [globalDebugModeActive]);

  const setFileTreePath = useCallback((newPath: string) => {
    const normalizedPath = path.normalize(newPath);
    if (globalDebugModeActive) console.log(`[EditorDialog] setFileTreePath called with: ${newPath}, normalized to: ${normalizedPath}`);
    setFileTreePathInternal(normalizedPath === '.' ? '/' : normalizedPath);
  }, [globalDebugModeActive]);


  // --- Derived states from active tab ---
  const activeTab = useMemo(() => {
    if (!activeTabPath) return null;
    return openedTabs.find(tab => tab.path === activeTabPath);
  }, [activeTabPath, openedTabs]);

  const editorContent = useMemo(() => activeTab?.content ?? "", [activeTab]);
  const editorLanguage = useMemo(() => activeTab?.language ?? "plaintext", [activeTab]);
  const hasUnsavedChanges = useMemo(() => activeTab?.unsavedChanges ?? false, [activeTab]);
  const isEditorLoading = useMemo(() => activeTab?.isLoading ?? false, [activeTab]);
  const isCurrentFileWritable = useMemo(() => activeTab?.isWritable ?? false, [activeTab]);
  const editorError = useMemo(() => activeTab?.error ?? null, [activeTab]);

  // --- Core Logic Functions ---

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab: filePath=${filePath}, fileName=${fileName}`);
    
    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      let newTabs;
      if (existingTabIndex !== -1) {
        const existingTab = prevTabs[existingTabIndex];
        newTabs = [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
      } else {
        const newTab: OpenedTabInfo = {
          path: filePath,
          name: fileName,
          content: null, 
          originalContent: null,
          language: getLanguageFromFilename(fileName),
          unsavedChanges: false,
          isLoading: true, // Set to true, content loading effect will handle it
          isWritable: null,
          error: null,
        };
        newTabs = [...prevTabs, newTab];
      }
      return newTabs;
    });
    setActiveTabPath(filePath);
  }, [globalDebugModeActive, setActiveTabPath]);

  // Effect for initial setup and when filePathToEdit changes
  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Initialization useEffect - isOpen:", isOpen, "filePathToEdit:", filePathToEdit);
    
    if (isOpen) {
      loadPanelSettings().then(settingsResult => {
        setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);
      }).catch(err => console.error("Failed to load panel settings for debug mode", err));

      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit);
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: fileTreePath will be set to ${normalizedInitialDir} from filePathToEdit ${filePathToEdit}`);
        setFileTreePath(normalizedInitialDir); // This will trigger file tree fetch
        
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: Opening/Activating tab for ${filePathToEdit}`);
        handleOpenOrActivateTab(filePathToEdit, path.basename(filePathToEdit));
      } else {
        // Dialog opens without a specific file, reset relevant states
        setOpenedTabs([]);
        setActiveTabPath(null);
        setFileTreePath('/'); // This will trigger file tree fetch for root
        if (globalDebugModeActive) console.log("[EditorDialog] Initializing: No filePathToEdit, setting tree to root.");
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
    } else { 
      // Dialog is closing, reset states
      setOpenedTabs([]); 
      setActiveTabPath(null);
      setServerSnapshots([]);
      setFileTreePath('/'); // Reset tree path when closing
      setFileTreeItems([]); // Clear tree items
      if (globalDebugModeActive) console.log("[EditorDialog] Dialog closing, states reset.");
    }
  }, [isOpen, filePathToEdit, isMaximized, handleOpenOrActivateTab, globalDebugModeActive, setFileTreePath, setActiveTabPath]);


  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) return; // Don't fetch if dialog is closed
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems called for path: ${pathToDisplay}`);
    
    setIsFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToDisplay)}`);
      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : { error: `Failed to list directory. Status: ${response.status}` }; }
        catch { errData = { error: `Failed to list directory. Status: ${response.status}. Response: ${errText.substring(0,100)}...` }; }
        throw new Error(errData.error || `Failed to list directory. Status: ${response.status}`);
      }
      const data = await response.json();
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems API response for ${pathToDisplay}:`, data);
      setFileTreeItems(Array.isArray(data.files) ? data.files : []);
      // Sync fileTreePath with the path confirmed by the API
      // This is important if the API normalizes paths (e.g., `/` vs `//`)
      setFileTreePathInternal(data.path || pathToDisplay); 
    } catch (e: any) {
      console.error("[EditorDialog] Error fetching file tree:", e);
      setFileTreeError(e.message || "An error occurred fetching directory listing.");
      setFileTreeItems([]);
    } finally {
      setIsFileTreeLoading(false);
    }
  }, [isOpen, globalDebugModeActive]);

  // Effect for fetching file tree items when fileTreePath changes
  useEffect(() => {
    if (isOpen && fileTreePath) { // Ensure dialog is open and path is set
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen]: Triggering fetchFileTreeItems for ${fileTreePath}`);
        fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);


  const fetchSnapshots = useCallback(async (currentFilePath: string) => {
    if (!currentFilePath || !isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots called for: ${currentFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentFilePath)}`);
      if (!response.ok) {
        const errorText = await response.text();
        let errData;
        try { errData = errorText ? JSON.parse(errorText) : { error: `Failed to fetch snapshots. Status: ${response.status}` }; }
        catch { errData = { error: `Failed to parse snapshot error response. Status: ${response.status}. Response: ${errorText.substring(0,100)}...` }; }
        throw new Error(errData.error || `Failed to fetch snapshots. Status: ${response.status}`);
      }
      const data = await response.json();
      const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots received ${snapshots.length} snapshots for ${currentFilePath}`);
      setServerSnapshots(snapshots);
    } catch (e: any) {
      console.error("[EditorDialog] Error fetching snapshots:", e);
      setSnapshotError(e.message || "An unexpected error occurred while fetching snapshots.");
      setServerSnapshots([]);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [isOpen, globalDebugModeActive]);


  // Effect for loading active tab content and its snapshots
  useEffect(() => {
    if (!activeTabPath || !isOpen) return;

    const tabToLoad = openedTabs.find(tab => tab.path === activeTabPath);

    if (tabToLoad && tabToLoad.content === null && tabToLoad.isLoading) {
      if (globalDebugModeActive) console.log(`[EditorDialog] Content Loading Effect: Fetching content for ${activeTabPath}`);
      // No need to set isLoading again here, it was set by handleOpenOrActivateTab

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(activeTabPath)}&view=true`)
        .then(async response => {
          if (!response.ok) {
            const errText = await response.text();
            let data;
            try { data = errText ? JSON.parse(errText) : { error: `HTTP error ${response.status}` }; }
            catch { data = { error: `Failed to parse error response: ${errText.substring(0,100)}... Status: ${response.status}`}; }
            throw new Error(data.error || data.details || data.message || `Failed to fetch file. Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (typeof data.writable !== 'boolean' || typeof data.content !== 'string') {
            throw new Error("Invalid response from server: missing 'writable' or 'content'.");
          }
          // Check activeTabPathRef.current to ensure this update is for the *still active* tab
          if (activeTabPathRef.current === activeTabPath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] Content Loaded for ${activeTabPath}: writable=${data.writable}, content length=${data.content.length}`);
            setOpenedTabs(prevTabs => prevTabs.map(t => 
              t.path === activeTabPath ? { 
                ...t, 
                content: data.content, 
                originalContent: data.content,
                isWritable: data.writable, 
                isLoading: false,
                unsavedChanges: false,
                error: null
              } : t
            ));
            fetchSnapshots(activeTabPath); // Fetch snapshots after content is loaded
          } else {
            if (globalDebugModeActive) console.log(`[EditorDialog] Content Loaded for ${activeTabPath}, but tab changed before state update. Not updating editor.`);
          }
        })
        .catch(e => {
          const errorMsg = e.message || "An unexpected error occurred while fetching file content.";
          console.error("[EditorDialog] Error fetching file content for " + activeTabPath + ":", e);
          if (activeTabPathRef.current === activeTabPath) {
            setOpenedTabs(prevTabs => prevTabs.map(t => 
              t.path === activeTabPath ? { ...t, error: errorMsg, isLoading: false, content: "", originalContent: "" } : t
            ));
          }
          setTimeout(() => toast({ title: "File Load Error", description: errorMsg, variant: "destructive" }), 0);
        });
    } else if (tabToLoad && tabToLoad.content !== null && !tabToLoad.isLoading) {
      // Content is already loaded, ensure snapshots are fetched if this tab just became active
      // This also ensures snapshots are refreshed if the active tab is clicked again (though content doesn't refetch)
      if (globalDebugModeActive) console.log(`[EditorDialog] Content Loading Effect: Content for ${activeTabPath} already loaded. Ensuring snapshots are fetched.`);
      fetchSnapshots(activeTabPath);
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, toast, fetchSnapshots]);
  
  const handleCreateSnapshot = useCallback(async () => {
    if (!activeTab || activeTab.content === null) {
        setTimeout(() => toast({ title: "Cannot Create Snapshot", description: "No active file or content not loaded.", variant: "destructive" }), 0);
        return;
    }
    if (globalDebugModeActive) console.log("[EditorDialog] handleCreateSnapshot called for", activeTab.path);
    setIsCreatingSnapshot(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: activeTab.path, content: activeTab.content, language: activeTab.language }),
      });
      const result = await response.json();
      if (!response.ok) { 
        const serverError = result.error || result.details || 'Failed to create snapshot.';
        if (globalDebugModeActive) console.error("[EditorDialog] Server error on snapshot creation:", serverError, result);
        throw new Error(serverError);
      }
      
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${activeTab.name} created.` }),0);
      setServerSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []); 
    } catch (e: any) {
      const errorMsg = e.message || "An unexpected error occurred while creating snapshot.";
      console.error("[EditorDialog] Error creating snapshot:", e);
      setSnapshotError(errorMsg);
      setTimeout(() => toast({ title: "Snapshot Creation Error", description: errorMsg, variant: "destructive" }),0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [activeTab, toast, globalDebugModeActive]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    if (!activeTabPath) return;
    if (globalDebugModeActive) { /* console.log(`[EditorDialog] handleEditorContentChange for ${activeTabPath}: new length ${newContent.length}`); */ }
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === activeTabPath 
        ? { 
            ...tab, 
            content: newContent, 
            unsavedChanges: newContent !== tab.originalContent 
          } 
        : tab
    ));
  }, [activeTabPath, globalDebugModeActive]);

  const handleSaveChanges = useCallback(async () => {
    if (!activeTab || activeTab.isWritable === false || activeTab.content === null) {
      setTimeout(() => toast({ title: "Cannot Save", description: !activeTab ? "No active file." : (activeTab.isWritable === false ? "File not writable." : "Content not loaded."), variant: "destructive" }),0);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSaveChanges for ${activeTab.path}. Has unsaved: ${activeTab.unsavedChanges}`);

    if (activeTab.unsavedChanges || globalDebugModeActive) { 
        if (globalDebugModeActive) console.log(`[EditorDialog] Creating snapshot before save for ${activeTab.path}`);
        await handleCreateSnapshot(); 
    } 

    setIsSaving(true);
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
          ? { ...tab, originalContent: tab.content, unsavedChanges: false, error: null } 
          : tab
      ));
    } catch (e: any) {
      const errorMsg = e.message || "An unexpected error occurred while saving.";
      console.error("[EditorDialog] Error saving file:", e);
      setTimeout(() => toast({ title: "Save Error", description: errorMsg, variant: "destructive" }),0);
    } finally {
      setIsSaving(false);
    }
  }, [activeTab, toast, handleCreateSnapshot, globalDebugModeActive]);

  // Keyboard shortcuts
  useEffect(() => {
    const canSave = isOpen && !isSaving && activeTab && (activeTab.isWritable !== false) && (hasUnsavedChanges || globalDebugModeActive);
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
  }, [isOpen, isSaving, activeTab, hasUnsavedChanges, globalDebugModeActive, handleSaveChanges, activeTabPath]);

  const handleLoadSnapshot = useCallback((snapshotToLoad: Snapshot) => {
    if (!activeTabPath) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] handleLoadSnapshot: Loading snapshot ID ${snapshotToLoad.id} for ${activeTabPath}`);
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === activeTabPath 
        ? { 
            ...tab, 
            content: snapshotToLoad.content, 
            language: snapshotToLoad.language,
            unsavedChanges: snapshotToLoad.content !== tab.originalContent // Original content remains from file load
          } 
        : tab
    ));
    setTimeout(() => toast({ title: "Snapshot Applied to Editor", description: `Content from ${format(new Date(snapshotToLoad.timestamp), 'PP HH:mm:ss')} applied. Save to persist.` }),0);
  }, [activeTabPath, toast, globalDebugModeActive]);
  
  const handleCloseTab = useCallback((pathToClose: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); 
    if (globalDebugModeActive) console.log(`[EditorDialog] handleCloseTab: Attempting to close ${pathToClose}`);

    const tabToClose = openedTabs.find(tab => tab.path === pathToClose);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`File "${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
        if (globalDebugModeActive) console.log(`[EditorDialog] handleCloseTab: Close cancelled for ${pathToClose} due to unsaved changes.`);
        return;
      }
    }

    let newActiveTabPathInternal: string | null = null;
    const remainingTabs = openedTabs.filter(tab => tab.path !== pathToClose);
    
    if (activeTabPath === pathToClose) { 
      if (remainingTabs.length > 0) {
        const closingTabIndexOriginal = openedTabs.findIndex(tab => tab.path === pathToClose);
        const newIndexToActivate = Math.max(0, Math.min(closingTabIndexOriginal -1, remainingTabs.length -1)); 
        newActiveTabPathInternal = remainingTabs[newIndexToActivate]?.path || null;
      } else {
        newActiveTabPathInternal = null; 
      }
    } else { 
      newActiveTabPathInternal = activeTabPath; 
    }
    
    setOpenedTabs(remainingTabs);
    setActiveTabPath(newActiveTabPathInternal); 

    if (remainingTabs.length === 0) { setIsSearchWidgetOpen(false); }
     if (globalDebugModeActive) console.log(`[EditorDialog] handleCloseTab: Closed ${pathToClose}. New active tab: ${newActiveTabPathInternal}. Remaining tabs: ${remainingTabs.length}`);

  }, [openedTabs, activeTabPath, setActiveTabPath, globalDebugModeActive]);

  const handleToggleLockSnapshot = useCallback(async (snapshotId: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleToggleLockSnapshot: Toggling lock for snapshot ${snapshotId}`);
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !s.isLocked} : s));
    setTimeout(() => toast({ title: "Snapshot Lock Toggled (Client)", description: "Server-side persistence for lock not yet implemented." }),0);
  }, [toast, globalDebugModeActive]);

  const handleDeleteSnapshot = useCallback(async (snapshotIdToDelete: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleDeleteSnapshot: Deleting snapshot ${snapshotIdToDelete}`);
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotIdToDelete));
     setTimeout(() => toast({ title: "Snapshot Deleted (Client)", description: "Server-side deletion for snapshots is not yet implemented."}), 0);
  }, [toast, globalDebugModeActive]);

  const handleViewSnapshotInPopup = useCallback((snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  }, []);
  
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
      view.dispatch({ selection: EditorSelection.single(localMatchesFound[0].from, localMatchesFound[0].to), effects: EditorView.scrollIntoView(localMatchesFound[0].from, { y: "center" }) });
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${query}" was not found.`, duration: 2000 }),0);
    }
  }, [toast]); 

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (newQuery.trim()) { performSearch(newQuery, isCaseSensitiveSearch); }
    else { setSearchMatches([]); setCurrentMatchIndex(-1); }
  }, [performSearch, isCaseSensitiveSearch]);

  const goToMatch = useCallback((index: number) => {
    if (editorRef.current?.view && searchMatches[index]) {
      const match = searchMatches[index];
      editorRef.current.view.dispatch({ selection: EditorSelection.single(match.from, match.to), effects: EditorView.scrollIntoView(match.from, { y: "center" }) });
      setCurrentMatchIndex(index);
    }
  }, [searchMatches]); 

  const handleNextSearchMatch = useCallback(() => { if (searchMatches.length === 0) return; const nextIndex = (currentMatchIndex + 1) % searchMatches.length; goToMatch(nextIndex); }, [currentMatchIndex, searchMatches, goToMatch]);
  const handlePreviousSearchMatch = useCallback(() => { if (searchMatches.length === 0) return; const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length; goToMatch(prevIndex); }, [currentMatchIndex, searchMatches, goToMatch]);
  
  const toggleCaseSensitiveSearch = useCallback(() => {
    const newCaseSensitive = !isCaseSensitiveSearch;
    setIsCaseSensitiveSearch(newCaseSensitive);
    if (searchQuery.trim()) { performSearch(searchQuery, newCaseSensitive); }
  }, [isCaseSensitiveSearch, searchQuery, performSearch]);

  const handlePresetSearch = useCallback((term: string) => { setSearchQuery(term); performSearch(term, isCaseSensitiveSearch); }, [performSearch, isCaseSensitiveSearch]);

  // Effect for search widget cleanup
  useEffect(() => {
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        if (globalDebugModeActive) console.log("[EditorDialog] Search widget cleanup: Closing widget, clearing matches.");
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
      }
  }, [isSearchWidgetOpen, searchMatches.length, globalDebugModeActive]);
  
  // --- Dialog Dragging and Maximizing Logic ---
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

  const toggleMaximize = useCallback(() => {
    if (isMaximized) { setPosition(prevPosition); } 
    else {
      if (dialogContentRef.current) { const rect = dialogContentRef.current.getBoundingClientRect(); setPrevPosition({ x: rect.left, y: rect.top });}
      setPosition({x: 0, y: 0});
    }
    setIsMaximized(prev => !prev);
  }, [isMaximized, prevPosition]);

  const dialogStyle: React.CSSProperties = useMemo(() => (isMaximized
  ? { position: 'fixed', left: '0px', top: '0px', width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', transform: 'none', borderRadius: '0px', margin: '0px' }
  : { position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, transform: 'none' }
  ),[isMaximized, position]);

  const saveButtonDisabled = useMemo(() => isSaving || !activeTab || activeTab.isWritable === false || !hasUnsavedChanges, [isSaving, activeTab, hasUnsavedChanges]);
  const createSnapshotButtonDisabled = useMemo(() => isCreatingSnapshot || isLoadingSnapshots || !activeTab || (!globalDebugModeActive && !hasUnsavedChanges), [isCreatingSnapshot, isLoadingSnapshots, globalDebugModeActive, hasUnsavedChanges, activeTab]);

  const handleCloseDialog = useCallback(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleCloseDialog called.");
    const anyUnsaved = openedTabs.some(tab => tab.unsavedChanges);
    if (anyUnsaved) {
      if (!window.confirm("You have unsaved changes in one or more tabs. Are you sure you want to close? Changes will be lost.")) { return; }
    }
    if (isMaximized) setIsMaximized(false); 
    onOpenChange(false); 
  },[openedTabs, isMaximized, onOpenChange, globalDebugModeActive]);
  
  // --- File Tree Sidebar Logic ---
  const handleTreeFolderClick = useCallback((folderName: string) => {
    const newPath = path.join(fileTreePath, folderName);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeFolderClick: ${folderName}. New tree path target: ${newPath}`);
    setFileTreePath(newPath);
  }, [fileTreePath, globalDebugModeActive, setFileTreePath]);

  const handleTreeFileClick = useCallback((fileNameInTree: string) => {
    const filePath = path.join(fileTreePath, fileNameInTree);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeFileClick: ${fileNameInTree}. Opening/activating tab for: ${filePath}`);
    handleOpenOrActivateTab(filePath, fileNameInTree);
  }, [fileTreePath, handleOpenOrActivateTab, globalDebugModeActive]);

  const handleTreeBackClick = useCallback(() => {
    if (fileTreePath === '/') {
      setTimeout(() => toast({ title: "Navigation Limit", description: "Already at root.", duration: 2000}),0);
      return;
    }
    const parentDir = path.dirname(fileTreePath);
    const newPath = parentDir === '.' ? '/' : parentDir;
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeBackClick. Current: ${fileTreePath}. New tree path target: ${newPath}`);
    setFileTreePath(newPath);
  }, [fileTreePath, toast, globalDebugModeActive, setFileTreePath]);

  const canGoBackInTree = useMemo(() => {
    if (!filePathToEdit && fileTreePath === '/') return false; // If opened at root without a file, can't go back
    if (filePathToEdit) {
        const initialBaseDir = path.dirname(filePathToEdit);
        const normalizedInitialBase = path.normalize(initialBaseDir === '.' ? '/' : initialBaseDir);
        return path.normalize(fileTreePath) !== normalizedInitialBase && path.normalize(fileTreePath) !== '/';
    }
    return fileTreePath !== '/';
  }, [fileTreePath, filePathToEdit]);


  if (!isOpen) return null;

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
            File Editor {activeTab ? `- ${activeTab.name}` : ''}
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

        <ScrollArea className="flex-shrink-0 bg-muted/50 border-b whitespace-nowrap no-scrollbar">
          <div className="flex items-center p-1.5 space-x-1">
            {openedTabs.map(tab => (
              <div
                key={tab.path}
                role="button"
                tabIndex={0}
                className={cn(
                  buttonVariants({ 
                    variant: activeTabPath === tab.path ? "secondary" : "ghost",
                    size: "sm"
                  }),
                  "h-8 px-3 text-xs font-medium relative group flex-shrink-0",
                   activeTabPath === tab.path ? "shadow-sm bg-background text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setActiveTabPath(tab.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTabPath(tab.path)}}
                title={tab.path}
              >
                {getFileIcon(tab.name, 'file')}
                <span className="ml-1.5 truncate max-w-[120px] sm:max-w-[150px]">{tab.name}</span>
                {tab.unsavedChanges && <span className="ml-1 text-amber-500 font-bold">*</span>}
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 ml-1.5 opacity-50 group-hover:opacity-100 absolute right-0.5 top-1/2 -translate-y-1/2"
                    onClick={(e) => handleCloseTab(tab.path, e)}
                >
                    <FileX2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {openedTabs.length === 0 && (
              <div className="px-3 py-1 text-xs text-muted-foreground italic">No files open. Double-click a file in the main manager or click a file in the tree.</div>
            )}
          </div>
        </ScrollArea>
        
        <div className="flex-grow flex flex-row min-h-0"> 
          <div className={cn(
              "flex flex-col border-r bg-muted/40",
              isMaximized ? "w-64" : "w-56", // Adjusted width for non-maximized
              "flex-shrink-0"
            )}
          >
            <div className="flex items-center p-2 border-b flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={!canGoBackInTree} className="h-7 w-7 mr-1">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <span className="text-xs font-medium truncate text-muted-foreground hover:text-foreground cursor-default" title={fileTreePath}>
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

          <div className="flex-grow flex flex-col min-w-0"> 
            {activeTab && (
              <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
                <div className="flex items-center gap-1">
                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSaveChanges} disabled={saveButtonDisabled} className="shadow-sm hover:scale-105">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>
                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="shadow-sm hover:scale-105" disabled={!activeTab}><SearchIconLucide className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Find (Ctrl+F)</p></TooltipContent></Tooltip></TooltipProvider>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
                  <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <span className="truncate max-w-[150px] sm:max-w-[250px] hover:text-foreground cursor-default" title={activeTab.path}>{activeTab.path}</span>
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
                     </TooltipTrigger><TooltipContent><p>Snapshots</p></TooltipContent></Tooltip></TooltipProvider>
                     <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
                      <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Snapshots for {activeTab?.name || "current file"} (Max: {MAX_SERVER_SNAPSHOTS})</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={(e) => {e.preventDefault(); setTimeout(handleCreateSnapshot,0)}} disabled={createSnapshotButtonDisabled}>{isCreatingSnapshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Create Snapshot</DropdownMenuItem>
                      {serverSnapshots.length > 0 && (<> <DropdownMenuSeparator /> <DropdownMenuGroup><DropdownMenuLabel className="text-xs px-2">Recent ({serverSnapshots.length})</DropdownMenuLabel>{snapshotError && <DropdownMenuLabel className="text-xs px-2 text-destructive">{snapshotError}</DropdownMenuLabel>} {serverSnapshots.map(snapshot => (<DropdownMenuItem key={snapshot.id} className="flex justify-between items-center text-xs" onSelect={(e) => e.preventDefault()}><span onClick={() => handleLoadSnapshot(snapshot)} className="cursor-pointer flex-grow hover:text-primary truncate pr-2">{format(new Date(snapshot.timestamp), 'HH:mm:ss')} ({formatDistanceToNowStrict(new Date(snapshot.timestamp))} ago) - Lang: {snapshot.language}</span><div className="flex items-center ml-1 gap-0.5 flex-shrink-0"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)} title="View"><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View Snapshot</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleLockSnapshot(snapshot.id)} title={snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground hover:bg-destructive/10" onClick={() => handleDeleteSnapshot(snapshot.id)} title="Delete Snapshot"><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider></div></DropdownMenuItem>))} </DropdownMenuGroup></>)}
                      {serverSnapshots.length === 0 && !isLoadingSnapshots && !isCreatingSnapshot && !snapshotError && (<DropdownMenuLabel className="text-xs text-muted-foreground px-2 italic py-1">No snapshots for this file.</DropdownMenuLabel>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}

            <div className={cn("flex-grow relative p-0 bg-background min-h-0", isDragging && "pointer-events-none")}>
              {!activeTab && (
                 <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">Select a file or open a new tab.</div>
              )}
              {isEditorLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}
              {editorError && <div className="p-4"><Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{editorError}</AlertDescription></Alert></div>}
              
              {activeTab && !isEditorLoading && !editorError && activeTab.isWritable === false && (
                <div className="p-4 flex-shrink-0"><Alert variant="destructive"><FileWarning className="h-4 w-4" /><ShadcnAlertTitle>Read-only Mode</ShadcnAlertTitle><AlertDescription>This file is not writable. Changes cannot be saved.</AlertDescription></Alert></div>
              )}
              {activeTab && !isEditorLoading && !editorError && (
                <CodeEditor
                  ref={editorRef}
                  key={activeTabPath} 
                  value={editorContent}
                  onChange={handleEditorContentChange}
                  language={editorLanguage}
                  readOnly={isSaving || (activeTab && activeTab.isWritable === false)}
                  className="h-full w-full border-0 rounded-none" 
                />
              )}

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
