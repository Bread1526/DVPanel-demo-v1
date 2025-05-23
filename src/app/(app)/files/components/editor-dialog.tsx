
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle, // Ensure DialogTitle is imported
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
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
  CaseSensitive as CaseSensitiveIcon,
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
  SaveAll,
  FilePlus,
  FolderPlus,
  Upload,
  RefreshCw,
  FileX2,
  Camera,
  Replace as ReplaceIcon,
  Sparkles as SparklesIcon, 
  Palette as PaletteIcon,    
  Settings2 as EditorSettingsIcon, 
  HelpCircle as HelpCircleIcon,
  PanelLeftClose,
  PanelRightClose,
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
import { EditorSelection, EditorState } from '@codemirror/state';

export interface Snapshot {
  id: string;
  timestamp: string;
  content: string;
  language: string;
  isLocked?: boolean;
}

interface OpenedTabInfo {
  path: string;
  name: string;
  content: string | null;
  originalContent: string | null; // To track unsaved changes
  language: string;
  isWritable: boolean | null;
  unsavedChanges: boolean;
  isLoading: boolean; // For individual tab content loading
  error?: string | null; // For individual tab loading errors
}

interface FileItemForTree {
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
}

interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null; // Path of the file to initially open
}

const MAX_SERVER_SNAPSHOTS = 10; // Max snapshots to keep (oldest unlocked pruned)
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];
const CONTENT_FETCH_TIMEOUT_MS = 20000; // 20 seconds for content fetching

// Helper function to get language from filename
function getLanguageFromFilename(filename: string | null): string {
  if (!filename) return 'plaintext';
  const extension = path.extname(filename).toLowerCase() || '';
  switch (extension) {
    case '.js': case '.jsx': return 'javascript';
    case '.ts': case '.tsx': return 'typescript';
    case '.html': case '.htm': return 'html';
    case '.css': case '.scss': return 'css';
    case '.json': return 'json';
    case '.yaml': case '.yml': return 'yaml';
    case '.md': return 'markdown';
    case '.py': return 'python';
    case '.sh': case '.bash': return 'shell';
    default: return 'plaintext';
  }
}

// Helper function to get file icon
function getFileIcon(filename: string, fileType: FileItemForTree['type']): React.ReactNode {
  if (fileType === 'folder') return <FolderIcon className="h-4 w-4 text-primary shrink-0" />;
  if (fileType === 'link') return <FileIconDefault className="h-4 w-4 text-purple-400 shrink-0" />; // Example for symlink
  if (fileType === 'unknown') return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;

  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.json': return <FileJsonIcon className="h-4 w-4 text-yellow-600 shrink-0" />;
    case '.yaml': case '.yml': return <ServerCogIcon className="h-4 w-4 text-indigo-400 shrink-0" />;
    case '.html': case '.htm': return <FileCode2Icon className="h-4 w-4 text-orange-500 shrink-0" />;
    case '.css': case '.scss': case '.sass': return <FileCode2Icon className="h-4 w-4 text-blue-500 shrink-0" />;
    case '.js': case '.jsx': case '.ts': case '.tsx': return <FileCode2Icon className="h-4 w-4 text-yellow-500 shrink-0" />;
    case '.txt': case '.md': case '.log': return <FileTextIcon className="h-4 w-4 text-gray-500 shrink-0" />;
    case '.png': case '.jpg': case 'jpeg': case '.gif': case '.svg': case '.webp': case '.ico': return <ImageIconLucide className="h-4 w-4 text-purple-500 shrink-0" />;
    case '.zip': case '.tar': case '.gz': case '.rar': case '.7z': return <ArchiveIcon className="h-4 w-4 text-amber-700 shrink-0" />;
    case '.sh': case '.bash': return <ShellIcon className="h-4 w-4 text-green-600 shrink-0" />;
    case '.bat': case '.cmd': return <FileTerminalIcon className="h-4 w-4 text-gray-700 shrink-0" />;
    case '.mp3': case '.wav': case '.ogg': return <AudioWaveformIcon className="h-4 w-4 text-pink-500 shrink-0" />;
    case '.mp4': case '.mov': case '.avi': case '.mkv': return <VideoIconLucide className="h-4 w-4 text-red-500 shrink-0" />;
    case '.db': case '.sqlite': case '.sql': return <DatabaseIcon className="h-4 w-4 text-indigo-500 shrink-0" />;
    case '.csv': case '.xls': case '.xlsx': return <ListIcon className="h-4 w-4 text-green-700 shrink-0" />;
    case '.exe': case '.dmg': case '.app': return <FileTextIcon className="h-4 w-4 text-gray-800 shrink-0" />; // Using FileTextIcon as generic app
    case '.pem': case '.crt': case '.key': return <ShieldIcon className="h-4 w-4 text-teal-500 shrink-0" />;
    case '.gitignore': case '.gitattributes': case '.gitmodules': return <GithubIcon className="h-4 w-4 text-neutral-700 shrink-0" />;
    default: return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export default function EditorDialog({ isOpen, onOpenChange, filePathToEdit }: EditorDialogProps) {
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null); // For potential future focus management

  // Tabs and Active Tab State
  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null); // To use in callbacks without re-triggering effects

  // File Tree State
  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreePathInput, setFileTreePathInput] = useState<string>('/');
  const [initialDirForReset, setInitialDirForResetInternal] = useState<string>('/');
  const fileTreePathRef = useRef<string>('/');
  const initialDirForResetRef = useRef<string>('/');

  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true); 

  // Server-Side Snapshots State (for the active file)
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  // Global Debug Mode (fetched from settings)
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);

  // Search Widget State
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // Save All State
  const [isSavingAll, setIsSavingAll] = useState(false);

  const dialogTitleId = React.useId(); // For accessibility

  // --- State Setters with Refs for Callbacks ---
  const setActiveTabPath = useCallback((newActivePath: string | null) => {
    if (globalDebugModeActive) console.log("[EditorDialog] setActiveTabPath called with:", newActivePath);
    activeTabPathRef.current = newActivePath;
    setActiveTabPathInternal(newActivePath);
  }, [globalDebugModeActive]);

  const setFileTreePath = useCallback((newPath: string) => {
    const normalizedPath = path.normalize(newPath);
    let finalPath = normalizedPath === '.' || normalizedPath === '' ? '/' : normalizedPath;
    // Remove trailing slash unless it's the root
    if (finalPath !== '/' && finalPath.endsWith('/')) {
        finalPath = finalPath.slice(0, -1);
    }
    if (globalDebugModeActive) console.log("[EditorDialog] setFileTreePath called with:", newPath, "Normalized to:", finalPath);
    fileTreePathRef.current = finalPath;
    setFileTreePathInternal(finalPath);
    setFileTreePathInput(finalPath); // Keep input in sync
  }, [globalDebugModeActive]);

  const setInitialDirForReset = useCallback((newPath: string) => {
    initialDirForResetRef.current = newPath;
    setInitialDirForResetInternal(newPath);
  }, []);


  // --- Derived State ---
  const activeTabData = useMemo(() => {
    if (!activeTabPathRef.current) return null;
    return openedTabs.find(tab => tab.path === activeTabPathRef.current) || null;
  }, [openedTabs]); // Dependency on activeTabPathRef.current handled by activeTabPath state

  const editorContentForActiveTab = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguageForActiveTab = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const hasUnsavedChangesForCurrentTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const isEditorLoadingForCurrentTab = useMemo(() => activeTabData?.isLoading ?? false, [activeTabData]);
  const editorDisplayErrorForCurrentTab = useMemo(() => activeTabData?.error, [activeTabData]);
  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);


  // --- File Tree Logic ---
  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) return;
    if (globalDebugModeActive) console.log("[EditorDialog] fetchFileTreeItems CALLED for path:", pathToDisplay);
    setIsFileTreeLoading(true);
    setFileTreeError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToDisplay)}`, {signal: controller.signal});
      clearTimeout(timeoutId);

      if (fileTreePathRef.current !== pathToDisplay) {
        if (globalDebugModeActive) console.log("[EditorDialog] fetchFileTreeItems: Stale request for", pathToDisplay, "current is", fileTreePathRef.current);
        setIsFileTreeLoading(false); // Still ensure loading is off if it was for this path
        return;
      }
      
      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : { error: `Failed to list directory. Status: ${response.status}` }; }
        catch { errData = { error: `Failed to list directory. Status: ${response.status}. Response: ${errText.substring(0,100)}...` }; }
        throw new Error(errData.error || `List directory failed. Status: ${response.status}`);
      }
      const data = await response.json();
      if (fileTreePathRef.current === pathToDisplay) { // Double check after await
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        // Update the input field to reflect the actual path from the server (handles normalization)
        if ((data.path || pathToDisplay) !== fileTreePathInput) setFileTreePathInput(data.path || pathToDisplay);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (fileTreePathRef.current === pathToDisplay) {
        const errorMsg = e.name === 'AbortError' ? 'Timeout fetching file tree.' : (e.message || "Error fetching file tree.");
        setFileTreeError(errorMsg);
        setFileTreeItems([]);
         if (globalDebugModeActive) console.error("[EditorDialog] fetchFileTreeItems ERROR:", errorMsg);
      }
    } finally {
      // Only set loading to false if this was the fetch for the *current* path
      if (fileTreePathRef.current === pathToDisplay) {
        setIsFileTreeLoading(false);
      }
    }
  }, [isOpen, fileTreePathInput, globalDebugModeActive]); // fileTreePathInput is okay here as it's synced with fileTreePathRef

  // --- Tab Management & Content Loading ---
  const handleOpenOrActivateTab = useCallback((filePath: string, fileName?: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab: filePath='${filePath}', fileName='${fileName}'`);
    const resolvedFileName = fileName || path.basename(filePath);
    
    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      if (existingTabIndex !== -1) {
        // If tab exists, move it to the end (most recently used)
        const existingTab = prevTabs[existingTabIndex];
        return [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
      } else {
        // If tab doesn't exist, add it
        return [...prevTabs, {
          path: filePath,
          name: resolvedFileName,
          content: null, // Content will be fetched by useEffect
          originalContent: null,
          language: getLanguageFromFilename(resolvedFileName),
          isWritable: null, // To be fetched
          unsavedChanges: false,
          isLoading: false, // Initial state, will be set to true by effect if content is null
          error: null,
        }];
      }
    });
    setActiveTabPath(filePath);
  }, [setActiveTabPath, globalDebugModeActive]);

  // --- Snapshot Logic ---
  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) {
      setServerSnapshots([]); // Clear if no active file or dialog closed
      return;
    }
    if (globalDebugModeActive) console.log("[EditorDialog] fetchSnapshots CALLED for:", filePathForSnapshots);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (activeTabPathRef.current !== filePathForSnapshots) {
         if (globalDebugModeActive) console.log("[EditorDialog] fetchSnapshots: Stale request for", filePathForSnapshots);
         return; // Don't update if tab changed during fetch
      }

      if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch { errorJson = { error: `Snapshots load error. Status: ${response.status}` }; }
          throw new Error(errorJson.error || "Failed to fetch snapshots from server.");
      }
      const data = await response.json();
      if (activeTabPathRef.current === filePathForSnapshots) { // Double check after await
          const snapshots = Array.isArray(data.snapshots) ? data.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];
          setServerSnapshots(snapshots);
          if (globalDebugModeActive) console.log("[EditorDialog] fetchSnapshots: Loaded", snapshots.length, "snapshots.");
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (activeTabPathRef.current === filePathForSnapshots) { // Only set error if still relevant
        const errorMsg = e.name === 'AbortError' ? 'Timeout fetching snapshots.' : (e.message || "Error fetching snapshots");
        setSnapshotError(errorMsg);
        setTimeout(() => toast({ title: "Snapshot Load Error", description: errorMsg, variant: "destructive" }), 0);
        if (globalDebugModeActive) console.error("[EditorDialog] fetchSnapshots ERROR:", errorMsg);
      }
    } finally {
      if (activeTabPathRef.current === filePathForSnapshots) { // Only clear loading if still relevant
        setIsLoadingSnapshots(false);
      }
    }
  }, [isOpen, toast, globalDebugModeActive]);


  // --- Initial Setup and Prop Handling ---
  useEffect(() => {
    if (isOpen) {
      // Fetch global settings (like debug mode)
      loadPanelSettings().then(settingsResult => {
        if (settingsResult.data) {
          setGlobalDebugModeActive(settingsResult.data.debugMode ?? false);
           if (settingsResult.data.debugMode) console.log("[EditorDialog] Global debug mode ACTIVE from settings.");
        }
      });

      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        setInitialDirForReset(normalizedInitialDir);
        setFileTreePath(normalizedInitialDir); 
        handleOpenOrActivateTab(filePathToEdit); 
      } else {
        // If dialog opens without a specific file, default to root for file tree.
        // No tab will be active initially.
        const defaultInitialDir = (activeTabPathRef.current && path.dirname(activeTabPathRef.current)) || '/';
        const normalizedDefaultDir = path.normalize(defaultInitialDir === '.' ? '/' : defaultInitialDir);
        setInitialDirForReset(normalizedDefaultDir);
        setFileTreePath(normalizedDefaultDir);
        // If tabs exist from a previous state within this dialog instance but no file path was given to open,
        // ensure an active tab is set, or clear if no tabs.
        if (openedTabs.length > 0 && !activeTabPathRef.current) {
          setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
           setActiveTabPath(null); // Ensure no active tab if there are no tabs
        }
      }
      // Reset search state when dialog opens
      setIsSearchWidgetOpen(false); setSearchQuery(""); setSearchMatches([]); setCurrentMatchIndex(-1);
    } else {
      // Optional: Reset state when dialog closes if desired (e.g., clear all opened tabs)
      // setOpenedTabs([]);
      // setActiveTabPath(null);
    }
  }, [isOpen, filePathToEdit, handleOpenOrActivateTab, setFileTreePath, setActiveTabPath, setInitialDirForReset]);


  // --- Effect for Fetching File Tree Items ---
  useEffect(() => {
    if (isOpen && fileTreePath) {
      fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems]); // `fetchFileTreeItems` is memoized


  // --- Effect for Fetching Content of Active Tab ---
  useEffect(() => {
    const currentActivePath = activeTabPathRef.current;
    if (!currentActivePath || !isOpen) return;

    const activeTabIndex = openedTabs.findIndex(tab => tab.path === currentActivePath);
    if (activeTabIndex === -1) return; // Should not happen if activeTabPath is set

    const activeFile = openedTabs[activeTabIndex];

    if (activeFile.content === null && !activeFile.isLoading && !activeFile.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Needs content for ${currentActivePath}. Fetching.`);
      // Mark as loading
      setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex ? { ...t, isLoading: true, error: null } : t));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActivePath)}&view=true`, { signal: controller.signal })
        .then(async response => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== currentActivePath) {
            if (globalDebugModeActive) console.log("[EditorDialog] useEffect[activeTabPath - ContentLoad]: Stale fetch response for", currentActivePath);
            return; // Tab changed during fetch
          }
          if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try { errorJson = errorText ? JSON.parse(errorText) : {error: `HTTP error ${response.status}`}; }
            catch { errorJson = {error: `Server Error ${response.status}: ${errorText.substring(0,100)}...`};}
            throw new Error(errorJson.error || `Failed to load content. Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data && activeTabPathRef.current === currentActivePath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Content received for ${currentActivePath}`);
            setOpenedTabs(prevTabs => prevTabs.map((t, idx) => 
              idx === activeTabIndex 
              ? { ...t, content: data.content, originalContent: data.content, isWritable: data.writable, isLoading: false, error: null } 
              : t 
            ));
            // Fetch snapshots after content is successfully loaded for the first time
            fetchSnapshots(currentActivePath);
          }
        })
        .catch((e: any) => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current === currentActivePath) {
            const errorMsg = e.name === 'AbortError' ? 'Timeout fetching content.' : (e.message || "Failed to load content.");
            if (globalDebugModeActive) console.error(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Error fetching content for ${currentActivePath}`, errorMsg);
            setOpenedTabs(prevTabs => prevTabs.map((t, idx) => 
              idx === activeTabIndex 
              ? { ...t, isLoading: false, error: errorMsg } 
              : t 
            ));
          }
        });
    } else if (activeFile.content !== null && !activeFile.isLoading && !activeFile.error) {
       // Content is loaded, check if snapshots need fetching (e.g., if they haven't been loaded yet for this tab)
       if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError && activeTabPathRef.current === activeFile.path) {
         if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content exists for ${currentActivePath}, fetching snapshots as they are missing.`);
         fetchSnapshots(currentActivePath);
      }
    }
  }, [activeTabPath, openedTabs, isOpen, fetchSnapshots, globalDebugModeActive]); // Dependencies: activeTabPath (actual state), openedTabs


  const handleCloseDialog = useCallback(() => {
    if (anyUnsavedFiles) {
      if (!window.confirm("You have unsaved changes in one or more tabs. Are you sure you want to close the editor?")) {
        return;
      }
    }
    onOpenChange(false);
    // Optional: Reset internal state when dialog closes
    // setOpenedTabs([]);
    // setActiveTabPath(null);
    // setFileTreePath('/'); // Or initialDirForReset
    // setFileTreeItems([]);
  }, [anyUnsavedFiles, onOpenChange]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;

    setOpenedTabs(prevTabs => 
      prevTabs.map(tab => 
        tab.path === currentActiveP 
        ? { ...tab, content: newContent, unsavedChanges: (tab.originalContent !== null ? newContent !== tab.originalContent : newContent !== "") } 
        : tab
      )
    );
  }, []);

  const handleCreateSnapshot = useCallback(async () => {
    const currentFileInEditorP = activeTabPathRef.current;
    if (!currentFileInEditorP) {
      setTimeout(() => toast({ title: "Error", description: "No active file to snapshot.", variant: "destructive" }), 0);
      return;
    }
    const activeTab = openedTabs.find(t => t.path === currentFileInEditorP);
    if (!activeTab || activeTab.content === null || activeTab.isLoading) {
      setTimeout(() => toast({ title: "Error", description: "No active content or file is loading.", variant: "destructive" }), 0);
      return;
    }

    setIsCreatingSnapshot(true); setSnapshotError(null);
    if (globalDebugModeActive) console.log("[EditorDialog] handleCreateSnapshot: Creating server snapshot for", currentFileInEditorP);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentFileInEditorP, content: activeTab.content, language: activeTab.language })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || "Server snapshot creation failed.");
      
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Server snapshot created for ${activeTab.name}.` }),0);
      if (Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentFileInEditorP); // Re-fetch if API response format changed
      }
    } catch (e: any) {
      setSnapshotError(e.message);
      setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }),0);
       if (globalDebugModeActive) console.error("[EditorDialog] handleCreateSnapshot ERROR:", e.message);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [openedTabs, globalDebugModeActive, toast, fetchSnapshots]);

  const handleSaveChanges = useCallback(async (tabToSavePath?: string) => {
    const pathOfFileToSave = tabToSavePath || activeTabPathRef.current;
    if (!pathOfFileToSave) {
      setTimeout(() => toast({ title: "Cannot Save", description: "No active file to save.", variant: "destructive" }),0);
      return { success: false };
    }

    const tabIndexToSave = openedTabs.findIndex(tab => tab.path === pathOfFileToSave);
    if (tabIndexToSave === -1) {
      setTimeout(() => toast({ title: "Cannot Save", description: `File "${path.basename(pathOfFileToSave)}" not found in opened tabs.`, variant: "destructive" }),0);
      return { success: false };
    }
    
    let tabToSave = openedTabs[tabIndexToSave];

    if (tabToSave.content === null || tabToSave.isWritable === false || tabToSave.isLoading) {
      setTimeout(() => toast({ title: "Cannot Save", description: `File ${tabToSave.name} is ${tabToSave.isLoading ? "loading" : "not writable or has no content"}.`, variant: "destructive" }),0);
      return { success: false };
    }
    
    const shouldCreateSnapshotBeforeSave = (tabToSave.unsavedChanges || globalDebugModeActive);
    if (shouldCreateSnapshotBeforeSave && activeTabPathRef.current === tabToSave.path) {
        // Await snapshot creation if it's for the active file and needs one
        if (globalDebugModeActive) console.log("[EditorDialog] handleSaveChanges: Creating pre-save snapshot for", tabToSave.name);
        await handleCreateSnapshot(); // This will fetch snapshots on its own success
    }
    
    setOpenedTabs(prev => prev.map((t, idx) => idx === tabIndexToSave ? {...t, isLoading: true, error: null } : t));
    if (globalDebugModeActive) console.log("[EditorDialog] handleSaveChanges: Saving", tabToSave.path);

    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tabToSave.path, content: tabToSave.content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Save operation failed on server.');
      
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${tabToSave.name} saved successfully.` }),0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) => 
        idx === tabIndexToSave 
        ? { ...tab, originalContent: tab.content, unsavedChanges: false, isLoading: false, error: null, isWritable: true } 
        : tab 
      ));
      return { success: true };
    } catch (e: any) {
      setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }),0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) => 
        idx === tabIndexToSave 
        ? { ...tab, error: e.message, isLoading: false } 
        : tab
      ));
       if (globalDebugModeActive) console.error("[EditorDialog] handleSaveChanges ERROR for", tabToSave.path, ":", e.message);
      return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, toast, handleCreateSnapshot]);

  const handleSaveAll = useCallback(async () => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleSaveAll: Initiated.");
    setIsSavingAll(true);
    let successCount = 0; let errorCount = 0;
    
    const tabsToAttemptSave = openedTabs.filter(tab => 
      (tab.unsavedChanges || globalDebugModeActive) && 
      tab.isWritable !== false && 
      !tab.isLoading &&
      tab.content !== null // Ensure there's content to save
    );

    if (tabsToAttemptSave.length === 0) {
      setTimeout(() => toast({ title: "Save All", description: "No files require saving or are eligible for saving." }),0);
      setIsSavingAll(false); 
      return;
    }

    for (const tab of tabsToAttemptSave) {
      const result = await handleSaveChanges(tab.path); // Pass path to save specific tab
      if (result.success) successCount++; else errorCount++;
    }
    setIsSavingAll(false);
    const message = errorCount > 0 ? `${successCount} saved. ${errorCount} failed.` : `${successCount} file(s) saved successfully.`;
    setTimeout(() => toast({ title: "Save All Complete", description: message, variant: errorCount > 0 ? "destructive" : "default" }),0);
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = serverSnapshots.find(s => s.id === snapshotId);
    const currentActiveP = activeTabPathRef.current;
    if (!snapshotToLoad || !currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "Snapshot or active file not found.", variant: "destructive" }),0);
      return;
    }
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === currentActiveP 
      ? { ...tab, content: snapshotToLoad.content, language: snapshotToLoad.language, unsavedChanges: snapshotToLoad.content !== tab.originalContent, error: null } // Clear any error on successful load
      : tab 
    ));
    setTimeout(() => toast({ title: "Snapshot Loaded", description: `Loaded snapshot for ${path.basename(currentActiveP)} from ${formatDistanceToNowStrict(new Date(snapshotToLoad.timestamp), { addSuffix: true })}.` }),0);
  }, [serverSnapshots, toast, openedTabs]);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "No active file selected for snapshot lock operation.", variant: "destructive" }),0);
      return;
    }
    // Optimistic UI update
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !isCurrentlyLocked} : s));
    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update lock status on server.");
      
      setTimeout(() => toast({ title: 'Snapshot Lock Updated', description: result.message || `Snapshot ${!isCurrentlyLocked ? 'locked' : 'unlocked'}.` }),0);
      // Re-fetch to ensure consistency with server, especially sorted order
      if (Array.isArray(result.snapshots)) {
         setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveP);
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Lock Error", description: e.message, variant: "destructive" }),0);
      // Revert optimistic update on error
      setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: isCurrentlyLocked} : s));
      fetchSnapshots(currentActiveP); // Re-fetch to be sure
    }
  }, [toast, fetchSnapshots]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "No active file selected to delete snapshot from.", variant: "destructive" }),0);
      return;
    }
    if (!window.confirm("Are you sure you want to delete this snapshot? This action cannot be undone.")) return;
    
    const originalSnapshots = [...serverSnapshots];
    // Optimistic UI update
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotId));
    
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to delete snapshot on server.");
      
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message || 'Snapshot removed.' }),0);
      if (Array.isArray(result.snapshots)) {
         setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } // Server should return the updated list
    } catch (e: any) {
      setTimeout(() => toast({ title: "Delete Error", description: e.message, variant: "destructive" }),0);
      setServerSnapshots(originalSnapshots); // Revert on error
    }
  }, [serverSnapshots, toast]); // Removed fetchSnapshots, as API should return new list


  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); 
    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`"${tabToClose.name}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }
    
    setOpenedTabs(prevTabs => {
      const originalIndex = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);
      
      if (activeTabPathRef.current === tabToClosePath) {
        if (updatedTabs.length > 0) {
          // Try to activate tab to the left, or the new last tab
          const newIndexToActivate = Math.max(0, Math.min(originalIndex -1, updatedTabs.length - 1)); 
          setActiveTabPath(updatedTabs[newIndexToActivate]?.path || null);
        } else {
          // No tabs left
          setActiveTabPath(null);
        }
      }
      return updatedTabs;
    });
  }, [openedTabs, setActiveTabPath]);

  // --- File Tree Interaction Handlers ---
  const handleTreeFileClick = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleTreeFileClick:", filePath);
    handleOpenOrActivateTab(filePath, fileName);
  }, [handleOpenOrActivateTab, globalDebugModeActive]);

  const handleTreeFolderClick = useCallback((folderName: string) => {
    const currentTreeP = fileTreePathRef.current;
    const newPath = path.join(currentTreeP, folderName);
    if (globalDebugModeActive) console.log("[EditorDialog] handleTreeFolderClick: folderName=", folderName, "currentTreePath=", currentTreeP, "newPath=", newPath);
    setFileTreePath(newPath);
  }, [setFileTreePath, globalDebugModeActive]);
  
  const normalizedInitialBaseDir = useMemo(() => {
      if (!filePathToEdit && !initialDirForResetRef.current) return '/'; // Default if no context
      const initialBaseDir = initialDirForResetRef.current || path.dirname(filePathToEdit || '/');
      let normalized = path.normalize(initialBaseDir);
      if (normalized === '.' || normalized === '') return '/';
      return normalized;
  }, [filePathToEdit]);

  const normalizedCurrentFileTreePath = useMemo(() => {
      let normalized = path.normalize(fileTreePathRef.current || '/');
      if (normalized === '.' || normalized === '') return '/';
      return normalized;
  }, []); // fileTreePathRef.current changes do not trigger re-memo, this is by design of ref


  const treeBackButtonDisabled = useMemo(() => {
    if (isFileTreeLoading) return true;
    const currentNormalized = path.normalize(fileTreePathRef.current || '/');
    // If filePathToEdit is null, baseToCompare defaults to root, meaning back is disabled only at root.
    const baseToCompare = initialDirForResetRef.current || (filePathToEdit ? path.normalize(path.dirname(filePathToEdit)) : '/');
    
    // Normalize baseToCompare to handle root case ('/' or '.')
    const finalBaseToCompare = (baseToCompare === '.' || baseToCompare === '') ? '/' : baseToCompare;

    if (currentNormalized === '/' || currentNormalized === finalBaseToCompare) {
      return true;
    }
    return false;
  }, [isFileTreeLoading, filePathToEdit]); // fileTreePathRef.current changes do not trigger re-memo

  const handleTreeBackClick = useCallback(() => {
    const currentFTP = fileTreePathRef.current;
    if (globalDebugModeActive) console.log("[EditorDialog] handleTreeBackClick: currentFileTreePath=", currentFTP);
    if (currentFTP === '/') return;

    const parentDir = path.dirname(currentFTP);
    const baseToCompare = initialDirForResetRef.current || (filePathToEdit ? path.dirname(filePathToEdit) : '/');
    const normalizedBaseToCompare = path.normalize(baseToCompare === '.' ? '/' : baseToCompare);

    if (path.normalize(parentDir) === normalizedBaseToCompare && currentFTP !== normalizedBaseToCompare) {
        setFileTreePath(normalizedBaseToCompare);
    } else if (parentDir === '.' || parentDir === currentFTP) { // Should not happen if dirname is correct
        setFileTreePath('/');
    } else {
        setFileTreePath(parentDir);
    }
  }, [setFileTreePath, filePathToEdit, globalDebugModeActive]);

  const handleFileTreePathSubmit = useCallback(() => {
    let trimmedPath = fileTreePathInput.trim();
    if (trimmedPath === "") trimmedPath = "/";
    let normalized = path.normalize(trimmedPath);
    // Ensure it's an absolute path starting with /
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    // Remove trailing slash unless it's the root
    if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    
    const newTreePath = normalized || '/';
    if (globalDebugModeActive) console.log("[EditorDialog] handleFileTreePathSubmit: newTreePath=", newTreePath);
    if (newTreePath !== fileTreePathRef.current) {
      setFileTreePath(newTreePath); // This will trigger fetch via useEffect
    } else {
      setFileTreePathInput(newTreePath); // Reset input to normalized if no actual change
    }
  }, [fileTreePathInput, setFileTreePath, globalDebugModeActive]);

  // --- Search Widget Logic ---
  const performSearch = useCallback((query?: string, caseSensitive?: boolean) => {
    const view = editorRef.current?.view;
    const currentSearchQuery = (query !== undefined ? query : searchQuery).trim();
    const currentCaseSensitive = caseSensitive !== undefined ? caseSensitive : isCaseSensitiveSearch;

    if (!view || !currentSearchQuery) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] performSearch: query='${currentSearchQuery}', caseSensitive=${currentCaseSensitive}`);
    
    // For case-insensitive search with SearchCursor, provide a `normalize` function
    const normalizeFn = currentCaseSensitive ? undefined : (str: string) => str.toLowerCase();

    const cursor = new SearchCursor(
        view.state.doc, 
        currentSearchQuery, 
        0, // from
        view.state.doc.length, // to
        normalizeFn 
    );
    
    const matchesFound: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) {
      matchesFound.push({ from: cursor.value.from, to: cursor.value.to });
    }
    setSearchMatches(matchesFound);

    if (matchesFound.length > 0) {
      setCurrentMatchIndex(0);
      setTimeout(() => { // Ensure editor view update happens after state update
        if (editorRef.current?.view) {
          editorRef.current.view.dispatch({
            selection: EditorSelection.single(matchesFound[0].from, matchesFound[0].to),
            effects: EditorView.scrollIntoView(matchesFound[0].from, { y: "center" })
          });
        }
      },0);
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${currentSearchQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, toast, globalDebugModeActive]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (!newQuery.trim()) { // Clear matches if query is empty
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
    } else {
        // Live search on input change:
        performSearch(newQuery, isCaseSensitiveSearch);
    }
  }, [performSearch, isCaseSensitiveSearch]);

  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if(searchQuery.trim()) performSearch(); // Re-run search on explicit submit (e.g., Enter key)
  }, [performSearch, searchQuery]);

  const goToMatch = useCallback((index: number) => {
    if (!editorRef.current?.view || index < 0 || index >= searchMatches.length) return;
    const match = searchMatches[index];
    editorRef.current.view.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      effects: EditorView.scrollIntoView(match.from, { y: "center" })
    });
    setCurrentMatchIndex(index);
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

  const handlePresetSearch = useCallback((term: string) => {
    setSearchQuery(term);
    // Use setTimeout to ensure state update for searchQuery is processed before performSearch uses it
    setTimeout(() => performSearch(term, isCaseSensitiveSearch), 0);
  }, [performSearch, isCaseSensitiveSearch]);

  const toggleCaseSensitiveSearch = useCallback(() => {
    const newCaseSensitiveState = !isCaseSensitiveSearch;
    setIsCaseSensitiveSearch(newCaseSensitiveState);
    // Use setTimeout to ensure state update for isCaseSensitiveSearch is processed before performSearch uses it
    setTimeout(() => performSearch(searchQuery, newCaseSensitiveState), 0);
  }, [performSearch, searchQuery, isCaseSensitiveSearch]);

  // --- Effect for File Tree Error Handling (Revert Path) ---
  useEffect(() => {
    if (fileTreeError && isOpen && initialDirForResetRef.current) {
        const currentTreeP = fileTreePathRef.current;
        const initialDir = initialDirForResetRef.current;
        if (currentTreeP !== initialDir) { // Only revert if not already at the reset dir
            setTimeout(() => toast({ title: "Invalid Path", description: `Path "${currentTreeP}" could not be listed. ${fileTreeError}. Reverting to initial directory.`, variant: "destructive", duration: 4000 }), 0);
            setFileTreePath(initialDir); // This will trigger input update via its own sync
            setFileTreeError(null); // Clear the error after handling
        } else {
            // If error occurred on the initialDir itself, just show toast but don't change path
            setTimeout(() => toast({ title: "Directory Error", description: `Could not list directory "${currentTreeP}": ${fileTreeError}.`, variant: "destructive", duration: 4000 }), 0);
            setFileTreeError(null); 
        }
    }
  }, [fileTreeError, isOpen, toast, setFileTreePath]); // Removed initialDirForResetRef.current from deps as it's a ref

  // --- Effect for Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentActiveP = activeTabPathRef.current;
      const activeElement = document.activeElement;
      const isEditorFocused = activeElement?.closest('.cm-editor') !== null;
      const isSearchInputFocused = activeElement?.id === "editor-search-input";
      const isTreeInputFocused = activeElement?.id === "file-tree-path-input";
      const currentActiveTabForShortcut = openedTabs.find(tab => tab.path === currentActiveP);

      // Ctrl+S or Cmd+S for Save
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (isOpen && currentActiveP && currentActiveTabForShortcut && currentActiveTabForShortcut.isWritable !== false && !currentActiveTabForShortcut.isLoading && !isSavingAll) {
          if(event.shiftKey) { // Ctrl+Shift+S for Save All
            if (globalDebugModeActive) console.log("[EditorDialog] Shortcut: Save All triggered.");
            handleSaveAll(); 
          } else { // Ctrl+S for Save
            if (globalDebugModeActive) console.log("[EditorDialog] Shortcut: Save triggered for", currentActiveP);
            handleSaveChanges(); 
          }
        }
      }
      // Ctrl+F or Cmd+F for Find (if editor focused)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && isOpen && currentActiveP) {
         if (!isSearchInputFocused && !isTreeInputFocused && isEditorFocused) {
          event.preventDefault();
          if (!isSearchWidgetOpen) { 
            setIsSearchWidgetOpen(true); 
            setTimeout(() => document.getElementById("editor-search-input")?.focus(), 0); 
          } else { 
            document.getElementById("editor-search-input")?.focus(); 
            document.getElementById("editor-search-input")?.select(); 
          }
        }
      }
      // Escape key to close search widget or dialog
      if (event.key === 'Escape') {
        if (isSearchWidgetOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsSearchWidgetOpen(false);
        } else if (isOpen && !isSnapshotViewerOpen) { // Don't close main dialog if snapshot viewer is open
          event.preventDefault();
          handleCloseDialog();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, openedTabs, handleSaveChanges, handleSaveAll, isSearchWidgetOpen, handleCloseDialog, isSnapshotViewerOpen, globalDebugModeActive]);

  // --- Effect to clear search highlighting when widget closes ---
  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Search Widget Open State Changed:", isSearchWidgetOpen);
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        setSearchMatches([]); // Clear found matches
        setCurrentMatchIndex(-1);
        // Clear selection in CodeMirror editor if it was from search
        if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            // Only clear if there's an active selection (from > to)
            if (currentSelection.from !== currentSelection.to) {
                 editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
            }
        }
    }
  }, [isSearchWidgetOpen, searchMatches.length, globalDebugModeActive]); // searchMatches.length added to correctly trigger when matches are cleared programmatically


  // --- Memoized Button Disabled States ---
  const saveButtonDisabled = useMemo(() => isSavingAll || !activeTabData || isEditorLoadingForCurrentTab || !isCurrentFileWritable || (!hasUnsavedChangesForCurrentTab && !globalDebugModeActive) || !!editorDisplayErrorForCurrentTab, [isSavingAll, activeTabData, isEditorLoadingForCurrentTab, isCurrentFileWritable, hasUnsavedChangesForCurrentTab, globalDebugModeActive, editorDisplayErrorForCurrentTab]);
  const saveAllButtonDisabled = useMemo(() => isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive), [isSavingAll, anyUnsavedFiles, globalDebugModeActive]);
  const createSnapshotButtonDisabled = useMemo(() => {
     const maxSnapshots = globalDebugModeActive ? MAX_SERVER_SNAPSHOTS + 5 : MAX_SERVER_SNAPSHOTS; // Allow more in debug
     return isCreatingSnapshot || !activeTabData || !activeTabData.content || isEditorLoadingForCurrentTab || !!editorDisplayErrorForCurrentTab || serverSnapshots.length >= maxSnapshots;
  }, [isCreatingSnapshot, activeTabData, isEditorLoadingForCurrentTab, serverSnapshots, editorDisplayErrorForCurrentTab, globalDebugModeActive]);


  // --- Toolbar Button Definitions ---
  const toolbarButtons = [
    { id: 'save', label: 'Save', icon: Save, onClick: () => handleSaveChanges(), disabled: saveButtonDisabled, isLoading: activeTabData?.isLoading && !isEditorLoadingForCurrentTab && !isSavingAll && activeTabData?.path === activeTabPathRef.current, tooltip: "Save (Ctrl+S)" },
    { id: 'saveAll', label: 'Save All', icon: SaveAll, onClick: handleSaveAll, disabled: saveAllButtonDisabled, isLoading: isSavingAll, tooltip: "Save All Unsaved Tabs (Ctrl+Shift+S)" },
    { id: 'find', label: 'Find', icon: SearchIconLucide, onClick: () => { setIsSearchWidgetOpen(prev => !prev); if (!isSearchWidgetOpen) { setTimeout(() => document.getElementById("editor-search-input")?.focus(),0); } }, disabled: !activeTabData || !!editorDisplayErrorForCurrentTab, tooltip: "Find in Current File (Ctrl+F)" },
    { id: 'snapshots', label: 'Snapshots', icon: Camera, dropdown: true, disabled: !activeTabData || !!editorDisplayErrorForCurrentTab || isLoadingSnapshots, tooltip: "File Snapshots (Server-Side)" },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, onClick: () => { if (activeTabData?.path) { handleOpenOrActivateTab(activeTabData.path, activeTabData.name); fetchSnapshots(activeTabData.path); } else { setTimeout(() => toast({title: "Refresh: No active file"}),0); } }, disabled: !activeTabData || activeTabData?.isLoading, tooltip: "Refresh File Content & Snapshots" },
    { id: 'replace', label: 'Replace', icon: ReplaceIcon, onClick: () => setTimeout(() => toast({ title: "Replace: Not Implemented Yet" }),0), disabled: true, tooltip: "Replace Text (Coming Soon)" },
    { id: 'jumpLine', label: 'GoTo', icon: SparklesIcon, onClick: () => setTimeout(() => toast({ title: "Jump to Line: Not Implemented Yet" }),0), disabled: true, tooltip: "Jump to Line (Coming Soon)" },
    { id: 'font', label: 'Font', icon: CaseSensitiveIcon, onClick: () => setTimeout(() => toast({ title: "Font Settings: Not Implemented Yet" }),0), disabled: true, tooltip: "Font Settings (Coming Soon)" },
    { id: 'theme', label: 'Theme', icon: PaletteIcon, onClick: () => setTimeout(() => toast({ title: "Editor Theme: Not Implemented Yet" }),0), disabled: true, tooltip: "Change Editor Theme (Coming Soon)" },
    { id: 'settings', label: 'Settings', icon: EditorSettingsIcon, onClick: () => setTimeout(() => toast({ title: "Editor Settings: Not Implemented Yet" }),0), disabled: true, tooltip: "Editor Settings (Coming Soon)" },
    { id: 'help', label: 'Help', icon: HelpCircleIcon, onClick: () => setTimeout(() => toast({ title: "Help: Not Implemented Yet" }),0), disabled: true, tooltip: "Editor Help (Coming Soon)" },
  ];


  if (!isOpen) return null;

  // Main Render
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        aria-labelledby={dialogTitleId}
        className={cn(
          "fixed inset-0 bg-background p-[60px] flex flex-col overflow-hidden", // Full viewport with padding
          // Removed dynamic style for fixed positioning and sizing
        )}
        hideCloseButton={true} // We use our own custom header close button
      >
        <div className="border-4 border-border/60 rounded-lg shadow-xl bg-card flex flex-col flex-1 overflow-hidden"> {/* Main bordered container */}
          {/* 1. Dialog Header (Title & Close Button) */}
          <DialogHeader className="relative flex items-center justify-between border-b border-border py-1.5 px-3 flex-shrink-0 h-[38px]"> {/* Compact Header */}
            <DialogTitle id={dialogTitleId} className="text-sm font-medium truncate">
              {activeTabData ? `${path.basename(activeTabData.path)} - File Editor` : "File Editor"}
            </DialogTitle>
            <TooltipProvider delayDuration={300}><Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-6 w-6">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Close Editor (Esc)</p></TooltipContent>
            </Tooltip></TooltipProvider>
          </DialogHeader>

          {/* 2. Unified Main Toolbar (Actions & File Info) */}
          <div className="flex items-center justify-between p-1.5 border-b border-border/60 bg-muted/20 flex-shrink-0 h-[42px]">
            <div className="flex items-center gap-0.5"> {/* Left-aligned buttons */}
              {toolbarButtons.map(btn => (
                <TooltipProvider key={btn.id} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {btn.dropdown ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={btn.disabled}>
                              <btn.icon className="h-4 w-4" />
                              <span className="text-xs ml-1.5">{btn.label}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-80 sm:w-96">
                            <DropdownMenuLabel className="text-xs">Server Snapshots</DropdownMenuLabel>
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-0">(Max {MAX_SERVER_SNAPSHOTS} server-side, oldest unlocked pruned)</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {isLoadingSnapshots ? ( <DropdownMenuItem disabled className="text-xs"><Loader2 className="mr-2 h-3 w-3 animate-spin" />Loading...</DropdownMenuItem>
                            ) : snapshotError ? ( <DropdownMenuItem disabled className="text-xs text-destructive"><AlertTriangle className="mr-2 h-3 w-3" />{snapshotError}</DropdownMenuItem>
                            ) : serverSnapshots.length === 0 ? ( <DropdownMenuItem disabled className="text-xs text-center py-2">No server snapshots.</DropdownMenuItem>
                            ) : (
                              <ScrollArea className="max-h-60">
                                {serverSnapshots.map((snapshot) => (
                                  <DropdownMenuItem key={snapshot.id} onSelect={(e) => e.preventDefault()} className="flex justify-between items-center text-xs p-1.5 hover:bg-accent/50">
                                    <div className="flex flex-col items-start cursor-pointer flex-grow mr-1 min-w-0" onClick={() => setTimeout(() => handleLoadSnapshot(snapshot.id),0)}>
                                      <span className={cn("truncate font-medium", snapshot.isLocked && "text-primary")}>
                                        {formatDistanceToNowStrict(new Date(snapshot.timestamp), { addSuffix: true })}
                                        {snapshot.isLocked && <Lock className="inline h-3 w-3 ml-1.5 text-amber-500" />}
                                      </span>
                                      <span className="text-muted-foreground text-[0.65rem] truncate">{format(new Date(snapshot.timestamp), 'MMM dd, yyyy h:mm a')}</span>
                                    </div>
                                    <div className="flex items-center shrink-0 space-x-0.5">
                                      <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedSnapshotForViewer(snapshot); setIsSnapshotViewerOpen(true);}}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View</p></TooltipContent></Tooltip></TooltipProvider>
                                      <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotLock(snapshot.id, !!snapshot.isLocked)}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider>
                                      <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground" onClick={() => handleDeleteSnapshot(snapshot.id)} disabled={snapshot.isLocked}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider>
                                    </div>
                                  </DropdownMenuItem>
                                ))}
                              </ScrollArea>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setTimeout(() => handleCreateSnapshot(),0)} disabled={createSnapshotButtonDisabled} className="text-xs">
                              {isCreatingSnapshot ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <Camera className="mr-2 h-3 w-3" />} Create Snapshot
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={btn.onClick} disabled={btn.disabled} isLoading={btn.isLoading}>
                          <btn.icon className="h-4 w-4" />
                           <span className="text-xs ml-1.5">{btn.label}</span>
                        </Button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent><p>{btn.tooltip}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            {/* Active File Info - Moved from below tabs to the right of this toolbar */}
            {activeTabData && (
                <div className="flex items-center space-x-2 text-xs text-muted-foreground shrink-0 ml-2 truncate">
                    <span className="font-mono truncate" title={activeTabData.path}>{activeTabData.path}</span>
                    <span>|</span>
                    <span className="capitalize">{editorLanguageForActiveTab}</span>
                    <span>|</span>
                    <span>{editorContentForActiveTab.length} chars</span>
                    <span>|</span>
                    <span>{editorContentForActiveTab.split('\n').length} lines</span>
                    {hasUnsavedChangesForCurrentTab && <span className="text-orange-400 font-semibold ml-1">* Unsaved</span>}
                    {!isCurrentFileWritable && activeTabData.isWritable !== null && <span className="text-red-400 font-semibold ml-1">(Read-only)</span>}
                </div>
            )}
          </div>
          
          {/* 3. Tab Bar */}
          <div className="flex-shrink-0 border-b border-border/60 bg-muted/20">
              <ScrollArea orientation="horizontal" className="h-auto whitespace-nowrap no-scrollbar">
                <div className="flex p-1.5 gap-1">
                  {openedTabs.map((tab) => (
                    <div
                      key={tab.path}
                      onClick={() => setActiveTabPath(tab.path)}
                      role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveTabPath(tab.path)}
                      className={cn(
                        "relative group flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-0 disabled:opacity-50 cursor-pointer",
                        activeTabPath === tab.path ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                        "pr-7" 
                      )}
                      title={tab.path}
                    >
                      <span className="truncate max-w-[150px]">{tab.name}</span>
                      {tab.unsavedChanges && <span className="ml-1.5 text-orange-400 font-bold">*</span>}
                      {tab.isLoading && !tab.error && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
                      {tab.error && <AlertTriangle className="ml-1.5 h-3 w-3 text-destructive" title={tab.error ?? undefined}/>}
                       <Button
                        variant="ghost" size="icon"
                        className={cn(
                          "absolute right-0.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-sm transition-opacity p-0", // Adjusted size and padding
                          activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80",
                          "opacity-30 group-hover:opacity-100"
                        )}
                        onClick={(e) => handleCloseTab(tab.path, e)}
                        aria-label={`Close tab ${tab.name}`}
                      ><X className="h-3 w-3" /></Button> {/* Adjusted icon size */}
                    </div>
                  ))}
                  {openedTabs.length === 0 && ( <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open. Click a file in the tree to open.</div> )}
                </div>
              </ScrollArea>
            </div>
            
          {/* 4. Main Content Area (File Tree | Editor Pane) */}
          <div className="flex flex-1 overflow-hidden min-h-0"> {/* This flex row takes remaining space */}
              {/* File Tree Sidebar (Collapsible) */}
              {isFileTreeOpen && (
                <div className="w-72 bg-muted/40 border-r border-border/60 flex flex-col flex-shrink-0 overflow-hidden">
                  {/* File Tree Header */}
                  <div className="p-2 border-b border-border/60 flex items-center gap-1 flex-shrink-0">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={treeBackButtonDisabled || isFileTreeLoading} className="h-7 w-7">
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent><p>Up One Level</p></TooltipContent></Tooltip></TooltipProvider>
                    <Input 
                      id="file-tree-path-input" 
                      className="h-7 text-xs px-2 py-1 flex-grow font-mono bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0" 
                      value={fileTreePathInput} 
                      onChange={(e) => setFileTreePathInput(e.target.value)} 
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFileTreePathSubmit(); } }} 
                      placeholder="Path..." 
                      disabled={isFileTreeLoading} 
                    />
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => fetchFileTreeItems(fileTreePathRef.current)} disabled={isFileTreeLoading} className="h-7 w-7">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger><TooltipContent><p>Refresh Tree</p></TooltipContent></Tooltip></TooltipProvider>
                  </div>
                  {/* File Tree List */}
                  <ScrollArea className="flex-grow p-1">
                    {isFileTreeLoading ? <div className="p-3 flex items-center justify-center text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading tree...</div>
                      : fileTreeError ? <Alert variant="destructive" className="m-2 text-xs"><FileWarning className="h-3 w-3" /><ShadcnAlertTitle className="text-xs font-semibold">Tree Error</ShadcnAlertTitle><AlertDescription className="text-xs">{fileTreeError}</AlertDescription></Alert>
                      : <ul> {fileTreeItems.map((item) => ( <li key={item.name} className="px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs" onClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(path.join(fileTreePathRef.current, item.name), item.name)}> <div className="flex items-center space-x-2"> {getFileIcon(item.name, item.type)} <span className="truncate">{item.name}</span> </div> </li> ))} {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && ( <li className="px-2 py-1 text-xs text-muted-foreground text-center">Empty directory.</li> )} </ul>
                    }
                  </ScrollArea>
                  {/* File Tree Footer Actions */}
                   <div className="p-1.5 border-t border-border/60 flex items-center justify-around flex-shrink-0">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTimeout(() => toast({title:"New File: Not Implemented"}),0)}><FilePlus className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>New File</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTimeout(() => toast({title:"New Folder: Not Implemented"}),0)}><FolderPlus className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>New Folder</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTimeout(() => toast({title:"Upload: Not Implemented"}),0)}><Upload className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>Upload</TooltipContent></Tooltip></TooltipProvider>
                  </div>
                </div>
              )}
              {/* Editor Pane */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-2 border-border/70 rounded-md shadow-sm m-1">
                {/* Active File Info Header (Below Tabs, specific to editor pane) */}
                <div className="flex items-center justify-between text-xs text-muted-foreground p-1.5 border-b border-border/60 bg-muted/40 flex-shrink-0 truncate">
                    <div className="flex items-center gap-1">
                        <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFileTreeOpen(prev => !prev)}>
                                {isFileTreeOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                            </Button>
                        </TooltipTrigger><TooltipContent>{isFileTreeOpen ? "Close File Tree" : "Open File Tree"}</TooltipContent></Tooltip></TooltipProvider>
                         {/* Removed active file path from here as it's in main toolbar now */}
                    </div>
                    {/* Moved file stats to main toolbar */}
                </div>
                <div className="flex-grow relative p-0 bg-background min-h-0">
                  {activeTabData ? (
                    <>
                      {isEditorLoadingForCurrentTab ? ( <div className="absolute inset-0 flex items-center justify-center text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...</div>
                      ) : editorDisplayErrorForCurrentTab ? ( <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center"> <AlertTriangle className="h-6 w-6 mb-2" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{editorDisplayErrorForCurrentTab}</AlertDescription> <Button variant="outline" size="sm" className="mt-3" onClick={() => { if (activeTabPathRef.current) { const path = activeTabPathRef.current; setOpenedTabs(prev => prev.map(t => t.path === path ? {...t, content: null, originalContent: null, error: null, isLoading: false} : t)); setTimeout(() => setActiveTabPath(path), 0); } }}>Retry</Button> </Alert>
                      ) : (
                        <CodeEditor ref={editorRef} value={editorContentForActiveTab} language={editorLanguageForActiveTab} onChange={handleEditorContentChange} readOnly={isEditorLoadingForCurrentTab || !isCurrentFileWritable || !!editorDisplayErrorForCurrentTab} className="h-full w-full border-0 rounded-none" />
                      )}
                      {/* Search Widget */}
                      {isSearchWidgetOpen && activeTabData && !isEditorLoadingForCurrentTab && !editorDisplayErrorForCurrentTab && (
                        <div className="absolute top-1 right-1 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                          <div className="flex items-center gap-1">
                            <Input id="editor-search-input" type="text" placeholder="Find..." value={searchQuery} onChange={handleSearchInputChange} onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()} className="h-7 text-xs px-2 py-1 flex-grow"/>
                            <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={toggleCaseSensitiveSearch} className={cn("h-6 w-6", isCaseSensitiveSearch && "bg-accent text-accent-foreground")}><CaseSensitiveIcon className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Case Sensitive</TooltipContent></Tooltip></TooltipProvider>
                            <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(false)} className="h-6 w-6"><X className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Close Search</TooltipContent></Tooltip></TooltipProvider>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex gap-0.5">
                              <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6"><ChevronUp className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Previous</TooltipContent></Tooltip></TooltipProvider>
                              <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6"><ChevronDown className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Next</TooltipContent></Tooltip></TooltipProvider>
                            </div>
                            <span className="text-xs text-muted-foreground truncate">{searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : "No matches"}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {PRESET_SEARCH_TERMS.map((term) => ( <Button key={term} variant="outline" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button> ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : ( <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center"><p>No file selected. Double-click a file in the tree or open a tab.</p></div> )}
                </div>
              </div>
            </div>
          {/* 5. Copyright Footer */}
          <DialogFooter className="p-1.5 border-t border-border/60 bg-muted/50 flex-shrink-0 text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} DVPanel
          </DialogFooter>
        </div>
        {isSnapshotViewerOpen && selectedSnapshotForViewer && (
          <SnapshotViewerDialog isOpen={isSnapshotViewerOpen} onOpenChange={setIsSnapshotViewerOpen} snapshot={selectedSnapshotForViewer} />
        )}
      </DialogContent>
    </Dialog>
  );
}

    
