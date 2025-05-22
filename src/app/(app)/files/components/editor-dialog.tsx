
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor'; // Default import
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal
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

interface FileItemForTree {
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
}

// This type is for the state of opened tabs
interface OpenedTabInfo {
  path: string; // Full path, acts as unique ID
  name: string; // Filename for display
  content: string | null; // Content, null if not yet fetched
  originalContent: string | null; // Content when opened/last saved, for unsaved changes
  language: string;
  isWritable: boolean | null; // Null if not yet determined
  unsavedChanges: boolean;
  isLoading: boolean; // True if content is being fetched for this tab
  error?: string | null; // Error specific to this tab's loading
}


interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null; // The initial file to open
}

const MAX_SERVER_SNAPSHOTS = 10;
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];


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
  const editorRef = useRef<ReactCodeMirrorRef>(null); // Ref for CodeMirror instance

  // --- State for Opened Tabs & Active Tab ---
  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null); // To manage active path in async callbacks

  // --- State for File Tree Sidebar ---
  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreePathInput, setFileTreePathInput] = useState<string>('/');
  const [initialDirForReset, setInitialDirForReset] = useState<string>('/'); // For reverting file tree on bad input
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const fileTreePathRef = useRef<string>('/'); // To manage tree path in async callbacks

  // --- State for Snapshots ---
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  // --- Global Settings & UI State ---
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  
  // --- Search Widget State ---
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // --- Save All State ---
  const [isSavingAll, setIsSavingAll] = useState(false);


  // --- Memoized Setters to prevent re-creation on every render ---
  const setActiveTabPath = useCallback((newActivePath: string | null) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] setActiveTabPath CALLED with: ${newActivePath}`);
    activeTabPathRef.current = newActivePath;
    setActiveTabPathInternal(newActivePath);
  }, [globalDebugModeActive]);

  const setFileTreePath = useCallback((newPath: string) => {
    const normalizedPath = path.normalize(newPath);
    const finalPath = normalizedPath === '.' || normalizedPath === '' ? '/' : normalizedPath;
    if (globalDebugModeActive) console.log(`[EditorDialog] setFileTreePath CALLED with: ${newPath}, normalized to: ${finalPath}`);
    fileTreePathRef.current = finalPath;
    setFileTreePathInternal(finalPath);
    setFileTreePathInput(finalPath); // Sync input field with the actual tree path
  }, [globalDebugModeActive]);

  // Decode initial file path once
  const decodedFilePathToEdit = useMemo(() => {
    if (!filePathToEdit) return null;
    try {
      return decodeURIComponent(filePathToEdit);
    } catch (e) {
      console.error("[EditorDialog] Error decoding filePathToEdit:", filePathToEdit, e);
      setTimeout(() => toast({ title: "Error", description: "Invalid file path provided for editor.", variant: "destructive" }), 0);
      return null;
    }
  }, [filePathToEdit, toast]);

  // --- Effect for Dialog Initialization & Opening ---
  useEffect(() => {
    const initializeDialog = async () => {
      if (globalDebugModeActive) console.log("[EditorDialog] initializeDialog START...", { filePathToEdit, decodedFilePathToEdit });
      try {
        const settingsResult = await loadPanelSettings();
        const panelSettings = settingsResult.data;
        if (panelSettings) {
          setGlobalDebugModeActive(panelSettings.debugMode ?? false);
          if (panelSettings.debugMode) console.log("[EditorDialog] Global debug mode from settings:", panelSettings.debugMode);
        } else {
          console.warn("[EditorDialog] Could not load panel settings for debug mode initialization.");
          setGlobalDebugModeActive(false);
        }
      } catch (err) {
        console.error("[EditorDialog] Failed to load panel settings for debug mode", err);
        setGlobalDebugModeActive(false);
      }

      if (decodedFilePathToEdit) {
        if (globalDebugModeActive) console.log("[EditorDialog] Initializing with decodedFilePathToEdit:", decodedFilePathToEdit);
        const initialDir = path.dirname(decodedFilePathToEdit) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        
        setFileTreePath(normalizedInitialDir);
        setInitialDirForReset(normalizedInitialDir);
        
        handleOpenOrActivateTab(decodedFilePathToEdit, path.basename(decodedFilePathToEdit));
      } else {
        // If dialog opens without a specific file (e.g. from a general "open editor" button not tied to a file)
        const defaultTreePath = (activeTabPathRef.current && openedTabs.length > 0) ? (path.dirname(activeTabPathRef.current) || '/') : '/';
        const normalizedDefaultTreePath = path.normalize(defaultTreePath === '.' ? '/' : defaultTreePath);
        setFileTreePath(normalizedDefaultTreePath);
        setInitialDirForReset(normalizedDefaultTreePath);

        if (openedTabs.length > 0 && !activeTabPathRef.current) {
          setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
          setActiveTabPath(null);
        }
      }
      setIsSearchWidgetOpen(false); setSearchQuery(""); setSearchMatches([]); setCurrentMatchIndex(-1);
      if (globalDebugModeActive) console.log("[EditorDialog] initializeDialog END.");
    };

    if (isOpen) {
      initializeDialog();
    } else {
      if (globalDebugModeActive) console.log("[EditorDialog] Dialog closing, non-persistent states reset (errors, etc.). Tabs remain if not explicitly cleared.");
      setFileTreeError(null);
      setSnapshotError(null);
      // Note: openedTabs and activeTabPath are NOT reset here, to preserve session state if dialog is re-opened.
      // They would be cleared if the main component using EditorDialog unmounts or explicitly clears them.
    }
  }, [isOpen, decodedFilePathToEdit, globalDebugModeActive, setActiveTabPath, setFileTreePath, toast]); // Dependencies carefully chosen

  // --- Refs for current paths to use in callbacks ---
  useEffect(() => { activeTabPathRef.current = activeTabPath; }, [activeTabPath]);
  useEffect(() => { fileTreePathRef.current = fileTreePath; }, [fileTreePath]);

  // --- Fetch File Tree Items ---
  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems CALLED for path: ${pathToDisplay}`);
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
      if (fileTreePathRef.current === pathToDisplay) { // Ensure update is for the current path
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems API response for ${pathToDisplay}:`, data.files?.length, "Server returned path:", data.path);
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        // Important: Sync fileTreePath with the path confirmed by the server if different
        if (data.path && path.normalize(data.path) !== path.normalize(pathToDisplay)) {
            if(globalDebugModeActive) console.log(`[EditorDialog] File tree path updated by server from ${pathToDisplay} to ${data.path}`);
            // Use the memoized setter to avoid potential issues
            setFileTreePathInternal(data.path); // Update internal state directly
            fileTreePathRef.current = data.path; // Update ref immediately
            setFileTreePathInput(data.path); // Update input field
        }
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Stale data for ${pathToDisplay}, current tree path is ${fileTreePathRef.current}. Discarding.`);
      }
    } catch (e: any) {
      if (fileTreePathRef.current === pathToDisplay) { // Only show error if it's for the current path
        console.error("[EditorDialog] Error fetching file tree for " + pathToDisplay + ":", e);
        setFileTreeError(e.message || "An error occurred fetching directory listing.");
        setFileTreeItems([]);
      } else {
         if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Error for stale path ${pathToDisplay}. Current path: ${fileTreePathRef.current}. Ignoring error display for this specific fetch.`);
      }
    } finally {
      if (fileTreePathRef.current === pathToDisplay) { // Ensure loading is only turned off for the current path's fetch
        setIsFileTreeLoading(false);
      }
    }
  }, [isOpen, globalDebugModeActive, setFileTreePathInternal]); // setFileTreePathInternal is stable from useCallback

  useEffect(() => {
    if (isOpen && fileTreePath) { // fileTreePath is the state variable
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen]: Triggering fetchFileTreeItems for ${fileTreePath}`);
        fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);


  // --- Effect for Handling File Tree Errors (e.g., invalid path typed by user) ---
  useEffect(() => {
    if (fileTreeError && isOpen && fileTreePathRef.current !== initialDirForReset) {
        if (globalDebugModeActive) console.warn(`[EditorDialog] File tree error for path '${fileTreePathRef.current}', attempting to reset to '${initialDirForReset}'. Error: ${fileTreeError}`);
        toast({ title: "Invalid Path", description: `Path "${fileTreePathRef.current}" could not be listed. ${fileTreeError}. Reverting to previous valid directory.`, variant: "destructive", duration: 4000 });
        setFileTreePath(initialDirForReset); // Use the memoized setter
        setFileTreeError(null); // Clear error after attempting reset
    }
  }, [fileTreeError, initialDirForReset, isOpen, toast, globalDebugModeActive, setFileTreePath]);

  // --- Fetch Snapshots for the Active Tab ---
  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Aborting, no file path or dialog closed for ${filePathForSnapshots}.`);
      setServerSnapshots([]); // Clear if no path or dialog closed
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots CALLED for: ${filePathForSnapshots}`);
    setIsLoadingSnapshots(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`);
      if (!response.ok) {
        let errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : {error: "Failed to fetch snapshots from server"};}
        catch { errData = {error: `Server error ${response.status} fetching snapshots: ${errText.substring(0, 100)}`};}
        throw new Error(errData.error || "Failed to fetch snapshots from server.");
      }
      const data = await response.json();
      const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots received ${snapshots.length} snapshots for ${filePathForSnapshots}`);

      // CRITICAL: Only update if the active tab is still the one we fetched for
      if (activeTabPathRef.current === filePathForSnapshots) {
        setServerSnapshots(snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Discarding snapshots for ${filePathForSnapshots} as active tab is now ${activeTabPathRef.current}`);
      }
    } catch (e: any) {
      console.error(`[EditorDialog] Error fetching snapshots for ${filePathForSnapshots}:`, e);
      if (activeTabPathRef.current === filePathForSnapshots) { // Only show error if it's for the current active tab
        setSnapshotError(e.message || "Error fetching snapshots");
        setTimeout(() => toast({ title: "Snapshot Load Error", description: e.message, variant: "destructive" }), 0);
      }
    } finally {
      if (activeTabPathRef.current === filePathForSnapshots) { // Ensure loading is only turned off for the current tab's fetch
        setIsLoadingSnapshots(false);
      }
    }
  }, [isOpen, globalDebugModeActive, toast]);

  // --- Open or Activate Tab and Fetch its Content if Needed ---
  const handleOpenOrActivateTab = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab CALLED for filePath: ${filePath}, fileName: ${fileName}`);

    const existingTabIndex = openedTabs.findIndex(tab => tab.path === filePath);

    if (existingTabIndex !== -1) { // Tab already exists, just activate it
      const existingTab = openedTabs[existingTabIndex];
      // Move to the end of the array to make it the "most recent" / visually last (if tabs reorder)
      const newTabs = [...openedTabs.slice(0, existingTabIndex), ...openedTabs.slice(existingTabIndex + 1), existingTab];
      setOpenedTabs(newTabs);
      setActiveTabPath(filePath); // This will trigger content load effect if content is null
    } else { // New tab
      const newTab: OpenedTabInfo = {
        path: filePath, name: fileName,
        content: null, originalContent: null, // Content starts as null
        language: getLanguageFromFilename(fileName),
        isWritable: null, unsavedChanges: false,
        isLoading: true, // Mark as loading initially
        error: null,
      };
      setOpenedTabs(prevTabs => [...prevTabs, newTab]);
      setActiveTabPath(filePath); // This will trigger content load effect
    }
  }, [globalDebugModeActive, openedTabs, setActiveTabPath]); // openedTabs is a dependency

  // --- Effect to Fetch Content for the Active Tab ---
  useEffect(() => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP || !isOpen) return; // No active tab or dialog closed

    const tabIndex = openedTabs.findIndex(tab => tab.path === currentActiveP);
    if (tabIndex === -1) { // Active tab not found in openedTabs (should not happen if logic is correct)
        if (globalDebugModeActive) console.warn(`[EditorDialog] Active tab ${currentActiveP} not found in openedTabs.`);
        return;
    }

    const currentActiveTab = openedTabs[tabIndex];

    // Fetch content if it's null and not already marked as errored
    if (currentActiveTab.content === null && !currentActiveTab.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Fetching content for ${currentActiveP}`);
      
      // Ensure isLoading is true for this specific tab before fetching
      if (!currentActiveTab.isLoading) {
        setOpenedTabs(prevTabs => prevTabs.map(t => t.path === currentActiveP ? { ...t, isLoading: true, error: null } : t));
      }

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActiveP)}&view=true`)
        .then(async response => {
            if (!response.ok) {
                let errorJson = { error: `Failed to load file content. Status: ${response.status}` };
                try { 
                    const text = await response.text();
                    if(text) errorJson = JSON.parse(text); 
                } catch { /* ignore parse error, use default */ }
                throw new Error(errorJson.error || `Failed to load file. Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
          // CRITICAL: Only update if the active tab is still the one we fetched for
          if (activeTabPathRef.current === currentActiveP) {
            if (globalDebugModeActive) console.log(`[EditorDialog] Content Loaded for ${currentActiveP}: writable=${data.writable}`);
            setOpenedTabs(prevTabs => prevTabs.map(t =>
              t.path === currentActiveP ? {
                ...t, content: data.content, originalContent: data.content,
                isWritable: data.writable, isLoading: false, unsavedChanges: false, error: null
              } : t
            ));
            fetchSnapshots(currentActiveP); // Fetch snapshots after content is loaded
          } else {
            if (globalDebugModeActive) console.log(`[EditorDialog] Discarding fetched content for ${currentActiveP} as active tab changed to ${activeTabPathRef.current}`);
          }
        })
        .catch((e: any) => {
          console.error(`[EditorDialog] Error fetching content for ${currentActiveP}:`, e.message);
          if (activeTabPathRef.current === currentActiveP) { // Only set error for the current active tab
            setOpenedTabs(prevTabs => prevTabs.map(t =>
              t.path === currentActiveP ? { ...t, isLoading: false, error: e.message || "Failed to load content." } : t
            ));
            setTimeout(() => toast({ title: "Error Loading File", description: e.message || "Failed to load file content.", variant: "destructive" }),0);
          }
        });
    } else if (currentActiveTab.content !== null && !currentActiveTab.isLoading && !currentActiveTab.error) {
        // Content is loaded, not loading, and no error. Check if snapshots need fetching.
        if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError) {
             if (globalDebugModeActive) console.log(`[EditorDialog] Content for ${currentActiveP} exists, snapshots empty. Fetching snapshots.`);
             fetchSnapshots(currentActiveP);
        }
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, fetchSnapshots, toast]); // Re-run when activeTabPath or openedTabs changes

  // --- Close Dialog Confirmation ---
  const handleCloseDialog = useCallback(() => {
    const anyUnsaved = openedTabs.some(tab => tab.unsavedChanges);
    if (anyUnsaved) {
      if (!window.confirm("You have unsaved changes in one or more tabs. Are you sure you want to close the editor? Your changes will be lost.")) {
        return; // User cancelled closing
      }
    }
    onOpenChange(false); // Proceed to close
  }, [openedTabs, onOpenChange]);

  // --- Editor Content Change Handler ---
  const handleEditorContentChange = useCallback((newContent: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;

    setOpenedTabs(prevTabs => prevTabs.map(tab => {
      if (tab.path === currentActiveP) {
        const hasChanged = tab.originalContent !== null ? newContent !== tab.originalContent : (newContent !== "");
        return { ...tab, content: newContent, unsavedChanges: hasChanged };
      }
      return tab;
    }));
  }, []); // Depends only on setOpenedTabs (stable) and activeTabPathRef (stable)

  // --- Create Snapshot ---
  const handleCreateSnapshot = useCallback(async () => {
    const currentActiveP = activeTabPathRef.current;
    const currentActiveTab = openedTabs.find(tab => tab.path === currentActiveP);

    if (!currentActiveTab || currentActiveTab.content === null || currentActiveTab.isLoading) {
        setTimeout(() => toast({ title: "Error", description: "No active file content to snapshot, or file is still loading.", variant: "destructive" }), 0);
        return;
    }
    if (globalDebugModeActive) console.log("[EditorDialog] handleCreateSnapshot CALLED for", currentActiveTab.path);
    setIsCreatingSnapshot(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentActiveTab.path, content: currentActiveTab.content, language: currentActiveTab.language }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || `Server error ${response.status} creating snapshot.`);
      }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${currentActiveTab.name} created.` }), 0);
      
      // API returns the full list of snapshots, update serverSnapshots directly
      if (Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else { // Fallback if API doesn't return snapshots directly (should not happen based on API spec)
        fetchSnapshots(currentActiveTab.path);
      }
    } catch (e: any) {
        if (globalDebugModeActive) console.error("[EditorDialog] Error creating snapshot:", e.message);
        setSnapshotError(e.message || "Error creating snapshot");
        setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }), 0);
    } finally { setIsCreatingSnapshot(false); }
  }, [openedTabs, globalDebugModeActive, toast, fetchSnapshots]);

  // --- Save Single Active File ---
  const handleSaveChanges = useCallback(async (tabToSavePath?: string) => {
    const pathOfFileToSave = tabToSavePath || activeTabPathRef.current;
    if (!pathOfFileToSave) {
        setTimeout(() => toast({ title: "Cannot Save", description: "No active file specified for saving.", variant: "destructive" }), 0);
        return { success: false };
    }
    
    const tabIndexToSave = openedTabs.findIndex(tab => tab.path === pathOfFileToSave);
    if (tabIndexToSave === -1) {
        setTimeout(() => toast({ title: "Cannot Save", description: `File "${path.basename(pathOfFileToSave)}" not found in opened tabs.`, variant: "destructive" }), 0);
        return { success: false };
    }
    const tabToSave = openedTabs[tabIndexToSave];

    if (tabToSave.content === null || tabToSave.isWritable === false || tabToSave.isLoading) {
        let reason = "";
        if (tabToSave.isLoading) reason = "still loading";
        else if (tabToSave.content === null) reason = "has no content";
        else if (tabToSave.isWritable === false) reason = "is not writable";
        setTimeout(() => toast({ title: "Cannot Save", description: `File "${tabToSave.name}" ${reason}.`, variant: "destructive" }), 0);
        return { success: false };
    }
    
    // Create snapshot only if there are actual changes, or if debug mode forces it
    const shouldCreateSnapshotBeforeSave = (tabToSave.unsavedChanges || (globalDebugModeActive && tabToSave.content !== tabToSave.originalContent));

    // Set loading state for the specific tab being saved
    setOpenedTabs(prev => prev.map((t, idx) => idx === tabIndexToSave ? {...t, isLoading: true, error: null } : t));

    try {
      if (shouldCreateSnapshotBeforeSave) {
        if (globalDebugModeActive) console.log(`[EditorDialog] Creating snapshot for ${tabToSave.name} before saving.`);
        await handleCreateSnapshot(); // handleCreateSnapshot already works on the active tab if called without args, or we need to adapt it.
                                     // For now, assuming handleCreateSnapshot works for the currently active tab.
                                     // If saving a non-active tab, this snapshot logic might need adjustment or be skipped.
                                     // For "Save All", snapshots are usually made for each changed file.
      }

      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tabToSave.path, content: tabToSave.content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to save file.');

      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${tabToSave.name} saved.` }), 0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) =>
        idx === tabIndexToSave
          ? { ...tab, originalContent: tab.content, unsavedChanges: false, error: null, isLoading: false }
          : tab
      ));
      return { success: true };
    } catch (e: any) {
        if (globalDebugModeActive) console.error(`[EditorDialog] Error saving file ${tabToSave.name}:`, e.message);
        setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }), 0);
        setOpenedTabs(prevTabs => prevTabs.map((tab, idx) => idx === tabIndexToSave ? { ...tab, error: e.message, isLoading: false } : tab));
        return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, handleCreateSnapshot, toast]);

  // --- Save All Unsaved Files ---
  const handleSaveAll = useCallback(async () => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleSaveAll CALLED");
    setIsSavingAll(true);
    let successCount = 0;
    let errorCount = 0;
    
    const tabsToProcess = openedTabs.filter(tab => 
      (tab.unsavedChanges || globalDebugModeActive) && // In debug mode, save even if not marked 'unsaved' as a test.
      tab.isWritable !== false && 
      tab.content !== null && 
      !tab.isLoading
    );

    if (tabsToProcess.length === 0) {
        toast({ title: "Save All", description: "No unsaved changes in writable files." });
        setIsSavingAll(false);
        return;
    }
    
    for (const tab of tabsToProcess) {
        // Temporarily activate tab for snapshot creation if needed, then save.
        // This is complex if handleCreateSnapshot only works on activeTab.
        // For simplicity, let's assume handleSaveChanges can save a specific tab by path.
        if (globalDebugModeActive) console.log(`[EditorDialog] Save All: Processing ${tab.path}`);
        const result = await handleSaveChanges(tab.path); // Pass path to save
        if (result.success) {
            successCount++;
        } else {
            errorCount++;
        }
    }
    setIsSavingAll(false);

    if (errorCount > 0) {
        toast({ title: "Save All Complete", description: `${successCount} file(s) saved. ${errorCount} file(s) failed.`, variant: "destructive" });
    } else if (successCount > 0) {
        toast({ title: "Save All Complete", description: `${successCount} file(s) saved successfully.` });
    } else if (tabsToProcess.length > 0 && successCount === 0 && errorCount === 0) {
         // This case implies all files were processed but resulted in no saves (e.g. debug mode, no actual changes)
         toast({ title: "Save All", description: "No actual content changes detected in files to save (Debug Mode).", variant: "default" });
    }
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentActiveP = activeTabPathRef.current;
      const currentActiveTabForShortcut = openedTabs.find(tab => tab.path === currentActiveP);

      const activeElement = document.activeElement;
      const isEditorWidgetFocused = activeElement?.closest('.cm-editor') !== null;
      const isSearchInputFocused = activeElement?.id === "editor-search-input";
      const isTreeInputFocused = activeElement?.id === "file-tree-path-input";

      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (isOpen && currentActiveP && currentActiveTabForShortcut && currentActiveTabForShortcut.isWritable !== false && !currentActiveTabForShortcut.isLoading) {
          if(event.shiftKey) {
            handleSaveAll();
          } else {
            handleSaveChanges(); // Saves currently active tab
          }
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && isOpen && currentActiveP) {
         if (!isSearchInputFocused && !isTreeInputFocused) { // Avoid stealing focus from tree/search input
          event.preventDefault();
          if (!isSearchWidgetOpen) {
            setIsSearchWidgetOpen(true);
            setTimeout(() => document.getElementById("editor-search-input")?.focus(), 0);
          } else {
            document.getElementById("editor-search-input")?.focus();
          }
        }
      }
    };

    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openedTabs, handleSaveChanges, handleSaveAll, globalDebugModeActive, isSearchWidgetOpen]); // Dependencies

  // --- Snapshot Management Callbacks ---
  const handleViewSnapshotInPopup = useCallback((snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  }, []);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "No active file selected.", variant: "destructive" }), 0);
      return;
    }
    const originalSnapshots = [...serverSnapshots]; // For optimistic revert
    // Optimistic UI update
    setServerSnapshots(prevSnapshots =>
      prevSnapshots.map(snapshot =>
        snapshot.id === snapshotId ? { ...snapshot, isLocked: !isCurrentlyLocked } : snapshot
      )
    );
    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || "Failed to update snapshot lock on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Lock Updated', description: result.message }), 0);
      // Re-fetch to ensure consistency, or update from result.snapshots if API returns it
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveP);
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Snapshot Lock Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots); // Revert optimistic update on error
    }
  }, [serverSnapshots, fetchSnapshots, toast]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
        setTimeout(() => toast({ title: "Error", description: "No active file selected.", variant: "destructive" }), 0);
        return;
    }
    if (!window.confirm("Are you sure you want to delete this snapshot? This action cannot be undone.")) return;

    const originalSnapshots = [...serverSnapshots]; // For optimistic revert
    // Optimistic UI update
    setServerSnapshots(prevSnapshots => prevSnapshots.filter(snapshot => snapshot.id !== snapshotId));

    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || "Failed to delete snapshot on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message }), 0);
      // Re-fetch to ensure consistency, or update from result.snapshots if API returns it
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveP);
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Snapshot Delete Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots); // Revert optimistic update
    }
  }, [serverSnapshots, fetchSnapshots, toast]);

  // --- Close Tab ---
  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); // Prevent activating tab when clicking close button
    if (globalDebugModeActive) console.log(`[EditorDialog] handleCloseTab initiated for: ${tabToClosePath}`);

    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`File "${tabToClose.name}" has unsaved changes. Are you sure you want to close it? Your changes will be lost locally.`)) {
        return; // User cancelled
      }
    }

    setOpenedTabs(prevTabs => {
      const originalIndex = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);

      if (activeTabPathRef.current === tabToClosePath) { // If closing the active tab
        if (updatedTabs.length > 0) {
          // Try to activate tab to the left, or the new last tab if closing the first one or last one
          const newIndexToActivate = Math.max(0, Math.min(originalIndex -1 , updatedTabs.length - 1));
          const newActivePath = updatedTabs[newIndexToActivate]?.path || null;
          // Use setTimeout to defer state update slightly, allowing other UI updates to settle
          setTimeout(() => setActiveTabPath(newActivePath), 0); 
        } else {
          setTimeout(() => setActiveTabPath(null), 0); // No tabs left, clear active path
        }
      }
      return updatedTabs;
    });
  }, [openedTabs, globalDebugModeActive, setActiveTabPath]);

  // --- File Tree Click Handlers ---
  const handleTreeFileClick = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeFileClick: ${filePath}`);
    handleOpenOrActivateTab(filePath, fileName);
  }, [handleOpenOrActivateTab, globalDebugModeActive]);

  const handleTreeFolderClick = useCallback((folderName: string) => {
    const newPath = path.join(fileTreePathRef.current, folderName);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeFolderClick: ${folderName}, new path: ${newPath}`);
    setFileTreePath(newPath);
  }, [setFileTreePath, globalDebugModeActive]);

  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    if (currentTreeP === '/') return;
    const parentDir = path.dirname(currentTreeP);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeBackClick: current=${currentTreeP}, parent=${parentDir}`);
    setFileTreePath(parentDir);
  }, [setFileTreePath, globalDebugModeActive]);

  const handleFileTreePathSubmit = useCallback(() => {
    const trimmedPath = fileTreePathInput.trim();
    let normalized = path.normalize(trimmedPath === '' ? '/' : trimmedPath);
    // Ensure path is absolute-like (starts with /)
    if (normalized !== '/' && !normalized.startsWith('/')) { normalized = '/' + normalized; }
    // Remove trailing slash unless it's the root
    if (normalized !== '/' && normalized.endsWith('/')) { normalized = normalized.slice(0, -1); }
    
    if (globalDebugModeActive) console.log(`[EditorDialog] handleFileTreePathSubmit: input='${fileTreePathInput}', normalized='${normalized || '/'}'`);
    setFileTreePath(normalized || '/');
  }, [fileTreePathInput, setFileTreePath, globalDebugModeActive]);


  // --- Memoized Derived State for Editor ---
  const activeTabData = useMemo(() => {
    if (!activeTabPath) return null;
    return openedTabs.find(tab => tab.path === activeTabPath) || null;
  }, [activeTabPath, openedTabs]);

  const editorContent = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguage = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const isEditorLoading = useMemo(() => activeTabData?.isLoading ?? false, [activeTabData]);
  // isEditorSaving now refers to the specific active tab's loading state when saving,
  // which is set inside handleSaveChanges before the API call.
  const isEditorSaving = useMemo(() => activeTabData?.isLoading && !activeTabData?.unsavedChanges && !activeTabData?.error, [activeTabData]);
  const hasUnsavedChangesForCurrentTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);

  // --- Search Functionality ---
  const performSearch = useCallback(() => {
    const view = editorRef.current?.view;
    const currentSearchQuery = searchQuery.trim();

    if (!view || !currentSearchQuery) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const cursor = new SearchCursor(
        view.state.doc, currentSearchQuery, 0, view.state.doc.length,
        isCaseSensitiveSearch ? undefined : (str: string) => str.toLowerCase() // Case-insensitive matching logic
    );
    const matchesFound: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) { matchesFound.push({ from: cursor.value.from, to: cursor.value.to }); }
    
    setSearchMatches(matchesFound);

    if (matchesFound.length > 0) {
      setCurrentMatchIndex(0);
      // Use setTimeout to ensure dispatch happens after state updates settle
      setTimeout(() => {
         if (editorRef.current?.view) {
            editorRef.current.view.dispatch({
                selection: EditorSelection.single(matchesFound[0].from, matchesFound[0].to),
                effects: EditorView.scrollIntoView(matchesFound[0].from, { y: "center" })
            });
         }
      }, 0);
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${searchQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, toast, editorRef]); // editorRef is stable

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    // Live search on input change if query is not empty
    if (newQuery.trim() === "") {
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
        // Optionally clear editor selection
         if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
    } else {
        setTimeout(() => performSearch(), 0); // Debounce or direct call
    }
  }, [performSearch]);

  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if(searchQuery.trim()) performSearch();
  }, [performSearch, searchQuery]);

  const goToMatch = useCallback((index: number) => {
    if (!editorRef.current?.view || index < 0 || index >= searchMatches.length) return;
    const match = searchMatches[index];
    editorRef.current.view.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      effects: EditorView.scrollIntoView(match.from, { y: "center" })
    });
    setCurrentMatchIndex(index);
  }, [searchMatches, editorRef]); // editorRef is stable

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
    setTimeout(() => performSearch(), 0); // Trigger search after setting query
  }, [performSearch]);

  const toggleCaseSensitiveSearch = useCallback(() => {
    setIsCaseSensitiveSearch(prev => {
      // Re-run search with new sensitivity, after state update
      setTimeout(() => performSearch(),0); 
      return !prev;
    });
  }, [performSearch]);

  // Clear search results if widget closes
  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Search widget open state:", isSearchWidgetOpen);
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
        // Optionally clear editor selection
        if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
    }
  }, [isSearchWidgetOpen, searchMatches.length, globalDebugModeActive, editorRef]); // editorRef is stable

  const editorDisplayError = activeTabData?.error;

  // --- Button Disabled States ---
  const saveButtonDisabled = isEditorSaving || !isCurrentFileWritable || (!hasUnsavedChangesForCurrentTab && !globalDebugModeActive) || isEditorLoading || !!editorDisplayError;
  const saveAllButtonDisabled = isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive);
  const createSnapshotButtonDisabled = isCreatingSnapshot || (!globalDebugModeActive && !hasUnsavedChangesForCurrentTab && !activeTabData?.content) || isEditorLoading || !!editorDisplayError;


  // --- RENDER ---
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[calc(100vw-250px)] h-[calc(100vh-30px)] max-w-7xl max-h-[calc(100vh-60px)]", // Default unmaximized size
          "p-0 border-border/50 shadow-xl overflow-hidden bg-secondary text-foreground flex flex-col rounded-lg"
        )}
        hideCloseButton={true} // We provide our own close button
      >
        {/* Dialog Header (Title and Close Button) */}
        <DialogHeader className="relative flex items-center justify-between border-b border-border py-1 px-3 flex-shrink-0">
          <DialogTitle className="text-sm font-semibold truncate">
             File Editor
          </DialogTitle>
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-6 w-6">
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger><TooltipContent><p>Close Editor (Esc)</p></TooltipContent></Tooltip></TooltipProvider>
        </DialogHeader>

        {/* Main Toolbar - Above Tabs */}
        <div className="flex items-center justify-between p-2 border-b border-border bg-muted/50 flex-shrink-0">
            <div className="flex items-center space-x-1">
                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => handleSaveChanges()} disabled={saveButtonDisabled} isLoading={isEditorSaving} className="h-7 px-2 py-1">
                    <Save className="h-4 w-4 mr-1.5" /><span className="text-xs">Save</span>
                </Button>
                </TooltipTrigger><TooltipContent><p>Save Changes (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>

                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleSaveAll} disabled={saveAllButtonDisabled} isLoading={isSavingAll} className="h-7 px-2 py-1">
                    <SaveAll className="h-4 w-4 mr-1.5" /><span className="text-xs">Save All</span>
                </Button>
                </TooltipTrigger><TooltipContent><p>Save All Unsaved Tabs (Ctrl+Shift+S)</p></TooltipContent></Tooltip></TooltipProvider>

                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="h-7 px-2 py-1">
                    <SearchIconLucide className="h-4 w-4 mr-1.5" /><span className="text-xs">Find</span>
                </Button>
                </TooltipTrigger><TooltipContent><p>Find in current file (Ctrl+F)</p></TooltipContent></Tooltip></TooltipProvider>
            </div>
            <div className="flex items-center space-x-1">
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2 py-1">
                           <Camera className="h-4 w-4 mr-1.5" /><span className="text-xs">Snapshots</span>
                        </Button>
                    </TooltipTrigger><TooltipContent><p>File Snapshots</p></TooltipContent></Tooltip></TooltipProvider>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80 sm:w-96"> {/* Wider dropdown */}
                        <DropdownMenuLabel className="text-xs">File Snapshots (Current File)</DropdownMenuLabel>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-0">(Max {MAX_SERVER_SNAPSHOTS} server-side, oldest unlocked are pruned)</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isLoadingSnapshots ? (
                        <DropdownMenuItem disabled className="text-xs"><Loader2 className="mr-2 h-3 w-3 animate-spin" />Loading snapshots...</DropdownMenuItem>
                        ) : snapshotError ? (
                        <DropdownMenuItem disabled className="text-xs text-destructive"><AlertTriangle className="mr-2 h-3 w-3" />{snapshotError}</DropdownMenuItem>
                        ) : serverSnapshots.length === 0 ? (
                        <DropdownMenuItem disabled className="text-xs text-center py-2">No server snapshots for this file.</DropdownMenuItem>
                        ) : (
                        <ScrollArea className="max-h-60"> {/* Increased max-h for more items */}
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
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View Snapshot Content</p></TooltipContent></Tooltip></TooltipProvider>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotLock(snapshot.id, !!snapshot.isLocked)}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock Snapshot (allows auto-pruning)" : "Lock Snapshot (prevents auto-pruning)"}</p></TooltipContent></Tooltip></TooltipProvider>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground" onClick={() => handleDeleteSnapshot(snapshot.id)} disabled={snapshot.isLocked}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete Snapshot (Locked snapshots cannot be deleted)</p></TooltipContent></Tooltip></TooltipProvider>
                                </div>
                            </DropdownMenuItem>
                            ))}
                        </ScrollArea>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => { setTimeout(() => handleCreateSnapshot(), 0); }} // setTimeout to allow dropdown to close
                          disabled={createSnapshotButtonDisabled}
                          className="text-xs"
                        >
                        {isCreatingSnapshot ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <Camera className="mr-2 h-3 w-3" />}
                        Create Snapshot
                        </DropdownMenuItem>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground pt-1">Snapshots are specific to this file.</DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        {/* Tab Bar */}
        <div className="flex-shrink-0 border-b border-border bg-muted/50">
          <ScrollArea orientation="horizontal" className="h-auto whitespace-nowrap no-scrollbar">
            <div className="flex p-1.5 gap-1">
              {openedTabs.map((tab) => (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveTabPath(tab.path)}
                  className={cn(
                    "relative flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 cursor-pointer group",
                    activeTabPath === tab.path
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                      "pr-6" // Extra padding on right for close button
                  )}
                  title={tab.path} // Show full path on hover
                >
                  {tab.name}
                  {tab.unsavedChanges && <span className="ml-1.5 text-orange-400">*</span>}
                  {tab.isLoading && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "absolute right-0.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm transition-opacity",
                       activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80",
                       "opacity-50 group-hover:opacity-100" // Show on group hover
                    )}
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    aria-label={`Close tab ${tab.name}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {openedTabs.length === 0 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open. Select a file from the tree.</div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Active File Info Header - Below Tabs */}
        {activeTabData && (
            <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-border bg-muted/40 text-xs text-muted-foreground">
                 <span className="truncate max-w-[150px] sm:max-w-xs md:max-w-sm lg:max-w-lg xl:max-w-xl" title={activeTabData.path}>{activeTabData.path}</span>
                 <div className="flex items-center space-x-2">
                    <span>{activeTabData.language}</span>
                    <span>|</span>
                    <span>{activeTabData.content?.length ?? 0} chars</span>
                    <span>|</span>
                    <span>{activeTabData.content?.split('\n').length ?? 0} lines</span>
                    {activeTabData.unsavedChanges && <span className="text-orange-400 font-semibold ml-2">* Unsaved</span>}
                    {!activeTabData.isWritable && activeTabData.isWritable !== null && <span className="text-red-400 font-semibold ml-2">(Read-only)</span>}
                 </div>
            </div>
        )}

        {/* Main Content Area (File Tree + Editor Pane) */}
        <div className="flex flex-grow overflow-hidden min-h-0">
          {/* File Tree Sidebar */}
          <div className="w-60 border-r border-border bg-muted/30 flex-shrink-0 flex flex-col min-h-0"> {/* Reduced width */}
            {/* Header for File Tree */}
            <div className="p-2 border-b border-border flex items-center gap-1 flex-shrink-0">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={fileTreePathRef.current === '/'} className="h-7 w-7">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent><p>Go Up One Directory</p></TooltipContent></Tooltip></TooltipProvider>
              <Input
                id="file-tree-path-input"
                className="h-7 text-xs px-2 py-1 flex-grow font-mono"
                value={fileTreePathInput}
                onChange={(e) => setFileTreePathInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFileTreePathSubmit(); } }}
                placeholder="Enter path..."
              />
            </div>
            {/* File Tree List */}
            <ScrollArea className="flex-grow p-1">
              {isFileTreeLoading ? (
                <div className="p-3 flex items-center justify-center text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading directory...
                </div>
              ) : fileTreeError ? (
                <Alert variant="destructive" className="m-2 text-xs">
                  <FileWarning className="h-3 w-3" />
                  <ShadcnAlertTitle className="text-xs font-semibold">Directory Error</ShadcnAlertTitle>
                  <AlertDescription className="text-xs">{fileTreeError}</AlertDescription>
                </Alert>
              ) : (
                <ul>
                  {fileTreeItems.map((item) => (
                    <li key={item.name}
                        className="px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs"
                        onClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(path.join(fileTreePathRef.current, item.name), item.name)}>
                      <div className="flex items-center space-x-2">
                        {getFileIcon(item.name, item.type)}
                        <span className="truncate">{item.name}</span>
                      </div>
                    </li>
                  ))}
                  {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && (
                    <li className="px-2 py-1 text-xs text-muted-foreground text-center">Empty directory.</li>
                  )}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Editor Pane */}
          <div className={cn("flex-1 flex flex-col min-h-0 min-w-0 border-l border-border shadow-sm", !activeTabData && "items-center justify-center", "border-2 border-border/70 rounded-md")}> {/* Added border here */}
             {activeTabData ? (
                <div className="flex-grow relative p-0 bg-background min-h-0"> {/* No padding, CodeEditor handles it */}
                    {isEditorLoading ? ( // This refers to content loading for the active tab
                    <div className="absolute inset-0 flex items-center justify-center text-sm">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...
                    </div>
                    ) : editorDisplayError ? ( // This refers to error loading content for the active tab
                    <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-6 w-6 mb-2" />
                        <ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle>
                        <AlertDescription>{editorDisplayError}</AlertDescription>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                            // Retry logic: clear error and mark for reload
                            setOpenedTabs(prev => prev.map(t => t.path === activeTabPath ? {...t, isLoading: true, error: null, content: null, originalContent: null} : t));
                        }}>Retry</Button>
                    </Alert>
                    ) : (
                    <CodeEditor
                        ref={editorRef}
                        value={editorContent}
                        language={editorLanguage}
                        onChange={handleEditorContentChange}
                        readOnly={isEditorSaving || !isCurrentFileWritable}
                        className="h-full w-full border-0 rounded-none" // Editor should fill this div
                    />
                    )}
                    {/* Custom Search Widget */}
                    {isSearchWidgetOpen && activeTabData && !isEditorLoading && !editorDisplayError && (
                    <div className="absolute top-2 right-2 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                        <div className="flex items-center gap-1">
                        <Input
                            id="editor-search-input"
                            type="text"
                            placeholder="Find..."
                            value={searchQuery}
                            onChange={handleSearchInputChange}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                            className="h-7 text-xs px-2 py-1 flex-grow"
                        />
                        <TooltipProvider><Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={toggleCaseSensitiveSearch} className={cn("h-6 w-6", isCaseSensitiveSearch && "bg-accent text-accent-foreground")}>
                            <CaseSensitive className="h-3 w-3" />
                            </Button>
                        </TooltipTrigger><TooltipContent>Case Sensitive</TooltipContent></Tooltip></TooltipProvider>
                        <TooltipProvider><Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(false)} className="h-6 w-6">
                            <X className="h-3 w-3" />
                            </Button>
                        </TooltipTrigger><TooltipContent>Close Search</TooltipContent></Tooltip></TooltipProvider>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                        <div className="flex gap-0.5">
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6">
                                <ChevronUp className="h-3 w-3" />
                            </Button>
                            </TooltipTrigger><TooltipContent>Previous Match</TooltipContent></Tooltip></TooltipProvider>
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6">
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                            </TooltipTrigger><TooltipContent>Next Match</TooltipContent></Tooltip></TooltipProvider>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                            {searchMatches.length > 0 ? `${currentMatchIndex + 1} / ${searchMatches.length}` : "No matches"}
                        </span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-1">
                        {PRESET_SEARCH_TERMS.map((term) => (
                            <Button key={term} variant="outline" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button>
                        ))}
                        </div>
                    </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
                <p>{decodedFilePathToEdit && !activeTabData ? "Error: Initial file path invalid or could not be opened." : "Select a file from the tree or open a tab to start editing."}</p>
                </div>
            )}
          </div>
        </div>

        {/* Copyright Footer */}
        <DialogFooter className="p-2 border-t border-border bg-muted/50 flex-shrink-0 text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} DVPanel
        </DialogFooter>

         {/* Snapshot Viewer Dialog (Portal) */}
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
