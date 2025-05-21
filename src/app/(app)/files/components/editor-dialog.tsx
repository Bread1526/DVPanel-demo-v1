
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
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

import { openSearchPanel, SearchCursor, setSearchQueryEffect, getSearchQuery, SearchQuery } from '@codemirror/search';
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

interface OpenedTabInfo {
  path: string;
  name: string;
  content: string | null;
  originalContent: string | null; // For unsaved changes detection
  language: string;
  unsavedChanges: boolean;
  isLoading: boolean;
  isWritable: boolean | null; // null initially, then boolean
  error?: string | null;
}


interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null; // Path of the file to initially open
}

const MAX_SERVER_SNAPSHOTS = 10; // Example limit, adjust as needed
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
  if (fileType === 'link') return <FileIconDefault className="h-4 w-4 text-purple-400 shrink-0" />; // Placeholder, consider a Link icon
  if (fileType === 'unknown') return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;

  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.json': return <FileJsonIcon className="h-4 w-4 text-yellow-600 shrink-0" />;
    case '.yaml': case '.yml': return <ServerCogIcon className="h-4 w-4 text-indigo-400 shrink-0" />;
    case '.html': case '.htm': return <FileCode2Icon className="h-4 w-4 text-orange-500 shrink-0" />;
    case '.css': case '.scss': case '.sass': return <FileCode2Icon className="h-4 w-4 text-blue-500 shrink-0" />;
    case '.js': case '.jsx': case '.ts': case '.tsx': return <FileCode2Icon className="h-4 w-4 text-yellow-500 shrink-0" />;
    case '.txt': case '.md': case '.log': return <FileTextIcon className="h-4 w-4 text-gray-500 shrink-0" />;
    case '.png': case '.jpg': case 'jpeg': '.gif': '.svg': '.webp': case '.ico': return <ImageIconLucide className="h-4 w-4 text-purple-500 shrink-0" />;
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

  // Tab Management
  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null);

  // File Tree Sidebar
  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const fileTreePathRef = useRef<string>('/');

  // Server-side Snapshots
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  // Search Widget
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // Dialog Dragging & Maximizing
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0 });
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [editorError, setEditorError] = useState<string | null>(null); // For generic editor errors


  // --- DERIVED STATES ---
  const activeTabData = useMemo(() => {
    if (!activeTabPath) return null;
    return openedTabs.find(tab => tab.path === activeTabPath) || null;
  }, [activeTabPath, openedTabs]);

  const editorContent = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguage = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const isEditorLoading = useMemo(() => activeTabData?.isLoading ?? false, [activeTabData]);
  const isEditorSaving = useMemo(() => {
    // This could be more specific if individual tabs can be in a saving state
    // For now, we'll use a global saving state for the active tab if needed, or assume quick saves
    return false; // Placeholder, replace with actual saving state if needed
  }, []);
  const hasUnsavedChanges = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);


  // --- REFS UPDATE ---
  useEffect(() => { activeTabPathRef.current = activeTabPath; }, [activeTabPath]);
  useEffect(() => { fileTreePathRef.current = fileTreePath; }, [fileTreePath]);

  const setActiveTabPath = useCallback((newActivePath: string | null) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] setActiveTabPath CALLED with: ${newActivePath}`);
    setActiveTabPathInternal(newActivePath);
  }, [globalDebugModeActive]);

  const setFileTreePath = useCallback((newPath: string) => {
    const normalizedPath = path.normalize(newPath);
    if (globalDebugModeActive) console.log(`[EditorDialog] setFileTreePath CALLED with: ${newPath}, normalized to: ${normalizedPath}`);
    setFileTreePathInternal(normalizedPath === '.' ? '/' : normalizedPath);
  }, [globalDebugModeActive]);


  // --- CORE FUNCTIONALITY ---

  const decodedFilePath = useMemo(() => {
    if (!filePathToEdit) return null;
    try {
        const parts = Array.isArray(filePathToEdit) ? filePathToEdit : [filePathToEdit];
        const decoded = decodeURIComponent(parts.join('/'));
        if (globalDebugModeActive) console.log(`[EditorDialog] Decoded filePathToEdit '${filePathToEdit}' to '${decoded}'`);
        return decoded;
    } catch (e) {
        console.error("[EditorDialog] Error decoding filePathToEdit:", filePathToEdit, e);
        setEditorError(`Failed to decode file path: ${filePathToEdit}. Please check the URL.`);
        return null;
    }
  }, [filePathToEdit, globalDebugModeActive]);

  // Initial setup when dialog opens or filePathToEdit changes
  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Main Init useEffect - isOpen:", isOpen, "filePathToEdit:", filePathToEdit, "decodedFilePath:", decodedFilePath);
    
    if (isOpen) {
      loadPanelSettings().then(settingsResult => {
        setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);
      }).catch(err => console.error("[EditorDialog] Failed to load panel settings for debug mode", err));

      if (decodedFilePath) {
        const initialDir = path.dirname(decodedFilePath) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: fileTreePath WILL BE SET to ${normalizedInitialDir} from decodedFilePath ${decodedFilePath}`);
        setFileTreePath(normalizedInitialDir);
        
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: Opening/Activating tab for ${decodedFilePath}`);
        handleOpenOrActivateTab(decodedFilePath, path.basename(decodedFilePath));
      } else if (filePathToEdit && !decodedFilePath) {
        // This means filePathToEdit was provided but decoding failed. Error is already set by useMemo.
        if (globalDebugModeActive) console.warn("[EditorDialog] Initializing: filePathToEdit present but decodedFilePath is null. Editor error should be shown.");
      } else {
        if (globalDebugModeActive) console.log("[EditorDialog] Initializing: No filePathToEdit, setting tree to root.");
        setFileTreePath('/');
        // Consider if activeTabPath should be cleared if dialog reopens without a specific file.
        // If there are already openedTabs, perhaps keep the last active one, or the first one.
        if (openedTabs.length === 0) {
          setActiveTabPath(null);
        }
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
      // Reset states that should not persist when dialog is fully closed
      // Consider whether to keep openedTabs and activeTabPath for quick reopen
      // setOpenedTabs([]); 
      // setActiveTabPath(null);
      setServerSnapshots([]);
      setFileTreePath('/');
      setFileTreeItems([]);
      setFileTreeError(null);
      setEditorError(null); // Clear editor-specific errors
      if (globalDebugModeActive) console.log("[EditorDialog] Dialog closing, non-persistent states reset.");
    }
  }, [isOpen, filePathToEdit, decodedFilePath, isMaximized, globalDebugModeActive]); // Removed handleOpenOrActivateTab, setFileTreePath


  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Dialog closed, aborting fetch for ${pathToDisplay}`);
      return;
    }
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

      if (fileTreePathRef.current !== pathToDisplay) {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Stale data for ${pathToDisplay}, current tree path is ${fileTreePathRef.current}. Discarding.`);
        setIsFileTreeLoading(false);
        return;
      }
      
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems API response for ${pathToDisplay}:`, data.files?.length);
      setFileTreeItems(Array.isArray(data.files) ? data.files : []);
      // Do NOT set fileTreePath here from data.path to avoid loops. Path is set by user actions.
    } catch (e: any) {
      if (fileTreePathRef.current === pathToDisplay) {
        console.error("[EditorDialog] Error fetching file tree:", e);
        setFileTreeError(e.message || "An error occurred fetching directory listing.");
        setFileTreeItems([]);
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Error for stale path ${pathToDisplay} (current: ${fileTreePathRef.current}). Ignoring error display.`);
      }
    } finally {
      if (fileTreePathRef.current === pathToDisplay) {
        setIsFileTreeLoading(false);
      }
    }
  }, [isOpen, globalDebugModeActive]); // Removed setFileTreePath from deps

  useEffect(() => {
    if (isOpen && fileTreePath) {
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen (state)]: Triggering fetchFileTreeItems for ${fileTreePath}`);
        fetchFileTreeItems(fileTreePath);
    } else if (!isOpen) {
        if (globalDebugModeActive) console.log("[EditorDialog] useEffect[fileTreePath, isOpen (state)]: Dialog is closed, clearing tree items.");
        setFileTreeItems([]);
        setFileTreeError(null);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);


  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Aborting, no file path or dialog closed.`);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots CALLED for: ${filePathForSnapshots}`);
    setIsLoadingSnapshots(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`);
      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : {error: "Failed to fetch snapshots from server"};}
        catch { errData = {error: `Server error ${response.status} fetching snapshots.`};}
        throw new Error(errData.error || "Failed to fetch snapshots from server.");
      }
      const data = await response.json();
      const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots received ${snapshots.length} snapshots for ${filePathForSnapshots}`);
      if (activeTabPathRef.current === filePathForSnapshots) {
        setServerSnapshots(snapshots);
      }
    } catch (e: any) {
      console.error(`[EditorDialog] Error fetching snapshots for ${filePathForSnapshots}:`, e);
      if (activeTabPathRef.current === filePathForSnapshots) {
        setSnapshotError(e.message || "Error fetching snapshots");
        setTimeout(() => toast({ title: "Snapshot Load Error", description: e.message, variant: "destructive" }), 0);
      }
    } finally {
      if (activeTabPathRef.current === filePathForSnapshots) {
        setIsLoadingSnapshots(false);
      }
    }
  }, [isOpen, globalDebugModeActive, toast]);


  // Effect for fetching content for the active tab
  useEffect(() => {
    const currentActivePath = activeTabPathRef.current;
    if (!currentActivePath || !isOpen) {
      if (globalDebugModeActive && currentActivePath) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Aborting content load. ActivePath: ${currentActivePath}, IsOpen: ${isOpen}`);
      return;
    }

    const currentActiveTab = openedTabs.find(tab => tab.path === currentActivePath);
    if (!currentActiveTab) {
      if (globalDebugModeActive) console.warn(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Active tab ${currentActivePath} not found in openedTabs. This shouldn't happen if tab activation is correct.`);
      return;
    }

    if (currentActiveTab.content === null && currentActiveTab.isLoading) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Fetching content for ${currentActivePath}`);
      setEditorError(null); // Clear previous editor errors for this tab
      
      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActivePath)}&view=true`)
        .then(async response => {
            if (!response.ok) {
                let errorJson = { error: `Failed to load file. Status: ${response.status}` };
                try { errorJson = await response.json(); } catch { /* ignore parsing error, use default */ }
                throw new Error(errorJson.error || `Failed to load file. Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
          if (activeTabPathRef.current === currentActivePath) {
            if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Content Loaded for ${currentActivePath}: writable=${data.writable}`);
            setOpenedTabs(prevTabs => prevTabs.map(t =>
              t.path === currentActivePath ? {
                ...t,
                content: data.content,
                originalContent: data.content,
                isWritable: data.writable,
                isLoading: false,
                unsavedChanges: false,
                error: null
              } : t
            ));
            fetchSnapshots(currentActivePath);
          } else {
             if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Stale content received for ${currentActivePath}, current active tab is ${activeTabPathRef.current}. Not updating UI.`);
          }
        })
        .catch((e: any) => {
          console.error(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Error fetching content for ${currentActivePath}`, e.message);
          if (activeTabPathRef.current === currentActivePath) {
            setOpenedTabs(prevTabs => prevTabs.map(t =>
              t.path === currentActivePath ? { ...t, isLoading: false, error: e.message || "Failed to load content." } : t
            ));
            setEditorError(e.message || "Failed to load content for the active tab.");
          }
        });
    } else if (currentActiveTab.content !== null && !currentActiveTab.isLoading && serverSnapshots.length === 0) { // Only fetch snapshots if content is loaded and snapshots aren't
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Content for ${currentActivePath} already loaded. Ensuring snapshots are fetched.`);
      fetchSnapshots(currentActivePath);
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, fetchSnapshots, serverSnapshots.length]);


  const handleOpenOrActivateTab = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab CALLED for filePath: ${filePath}, fileName: ${fileName}`);
    
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
                isLoading: true, 
                isWritable: null, 
                error: null,
            };
            newTabs = [...prevTabs, newTab];
        }
        return newTabs;
    });
    setActiveTabPath(filePath);
  }, [globalDebugModeActive, setActiveTabPath]); // Dependencies should be minimal and stable


  const handleCloseDialog = useCallback(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleCloseDialog CALLED. Checking for unsaved changes.");
    const anyUnsaved = openedTabs.some(tab => tab.unsavedChanges);
    if (anyUnsaved) {
      if (window.confirm("You have unsaved changes. Are you sure you want to close the editor? Your changes will be lost.")) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(false);
    }
  }, [openedTabs, onOpenChange, globalDebugModeActive]);


  const handleEditorContentChange = useCallback((newContent: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] handleEditorContentChange for ${currentActiveP}. New length: ${newContent.length}`);
    
    setOpenedTabs(prevTabs => prevTabs.map(tab => {
      if (tab.path === currentActiveP) {
        return { ...tab, content: newContent, unsavedChanges: newContent !== tab.originalContent };
      }
      return tab;
    }));
  }, [globalDebugModeActive]); // Removed activeTabPathRef from deps as it's a ref


  const handleCreateSnapshot = useCallback(async () => {
    const currentActiveP = activeTabPathRef.current;
    const currentActiveTab = openedTabs.find(tab => tab.path === currentActiveP);

    if (!currentActiveTab || currentActiveTab.content === null) {
        setTimeout(() => toast({ title: "Error", description: "No active file or content to snapshot.", variant: "destructive" }), 0);
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
          throw new Error(result.error || result.details || "Failed to create snapshot on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${currentActiveTab.name} created.` }), 0);
      if (Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots);
      } else {
        fetchSnapshots(currentActiveTab.path);
      }
    } catch (e: any) {
        if (globalDebugModeActive) console.error("[EditorDialog] Error creating snapshot:", e.message);
        setSnapshotError(e.message || "Error creating snapshot");
        setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }), 0);
    } finally { setIsCreatingSnapshot(false); }
  }, [openedTabs, globalDebugModeActive, toast, fetchSnapshots]); // Removed activeTabPathRef from deps


  const handleSaveChanges = useCallback(async () => {
    const currentActiveP = activeTabPathRef.current;
    const currentActiveTab = openedTabs.find(tab => tab.path === currentActiveP);

    if (!currentActiveTab || currentActiveTab.content === null || currentActiveTab.isWritable === false) {
        setTimeout(() => toast({ title: "Cannot Save", description: "File is not writable, has no content, or no file is active.", variant: "destructive" }), 0);
        return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSaveChanges initiated for ${currentActiveTab.path}. Unsaved: ${currentActiveTab.unsavedChanges}`);
    
    if (currentActiveTab.unsavedChanges || globalDebugModeActive) { // Create snapshot if unsaved or if debug mode forces it
      await handleCreateSnapshot();
    }
    
    setOpenedTabs(prev => prev.map(t => t.path === currentActiveTab.path ? {...t, isLoading: true, error: null } : t));

    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentActiveTab.path, content: currentActiveTab.content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to save file.');
      
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${currentActiveTab.name} saved.` }), 0);
      setOpenedTabs(prevTabs => prevTabs.map(tab =>
        tab.path === currentActiveTab.path
          ? { ...tab, originalContent: tab.content, unsavedChanges: false, error: null, isLoading: false }
          : tab
      ));
    } catch (e: any) {
        if (globalDebugModeActive) console.error("[EditorDialog] Error saving file:", e.message);
        setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }), 0);
        setOpenedTabs(prevTabs => prevTabs.map(tab => tab.path === currentActiveTab.path ? { ...tab, error: e.message, isLoading: false } : tab));
    }
  }, [openedTabs, globalDebugModeActive, toast, handleCreateSnapshot]); // Added setOpenedTabs, removed activeTabPathRef, setActivePath.


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentActiveP = activeTabPathRef.current;
      const currentActiveTabForShortcut = openedTabs.find(tab => tab.path === currentActiveP);
      
      // Check if an input field is focused to avoid interfering with typing
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (isOpen && currentActiveP && currentActiveTabForShortcut && currentActiveTabForShortcut.isWritable !== false) {
          handleSaveChanges();
        } else if (isOpen) {
          if (globalDebugModeActive) console.log("[EditorDialog] Ctrl+S: Cannot save, conditions not met (e.g., not writable, no active tab).");
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && isOpen && currentActiveP && !isInputFocused) {
        event.preventDefault();
        setIsSearchWidgetOpen(prev => !prev);
        if (globalDebugModeActive) console.log("[EditorDialog] Ctrl+F: Toggled search widget.");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openedTabs, handleSaveChanges, globalDebugModeActive]);


  const handleSnapshotSelect = useCallback((snapshot: Snapshot) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSnapshotSelect for snapshot ${snapshot.id}`);
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  }, [globalDebugModeActive]);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    const currentActiveTab = openedTabs.find(tab => tab.path === currentActiveP);
    if (!currentActiveTab) {
      setTimeout(() => toast({ title: "Error", description: "No active file to lock snapshot.", variant: "destructive" }), 0);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSnapshotLock (ID=${snapshotId}) called for ${currentActiveTab.path}. Currently locked: ${isCurrentlyLocked}`);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: snapshotId, filePath: currentActiveTab.path, lock: !isCurrentlyLocked }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || "Failed to lock/unlock snapshot on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Lock Updated', description: result.message }), 0);
      setServerSnapshots(prevSnapshots =>
        prevSnapshots.map(snapshot =>
          snapshot.id === snapshotId ? { ...snapshot, isLocked: !isCurrentlyLocked } : snapshot
        )
      );
    } catch (e: any) {
      if (globalDebugModeActive) console.error("[EditorDialog] Error updating snapshot lock:", e.message);
      setTimeout(() => toast({ title: "Snapshot Lock Error", description: e.message, variant: "destructive" }), 0);
    }
  }, [openedTabs, globalDebugModeActive, toast]); // Removed activeTabPathRef

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    const currentActiveTab = openedTabs.find(tab => tab.path === currentActiveP);
    if (!currentActiveTab) {
        setTimeout(() => toast({ title: "Error", description: "No active file to delete snapshot from.", variant: "destructive" }), 0);
        return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] handleDeleteSnapshot CALLED for snapshot ID ${snapshotId} in ${currentActiveTab.path}`);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: snapshotId, filePath: currentActiveTab.path }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || "Failed to delete snapshot on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message }), 0);
      setServerSnapshots(prevSnapshots => prevSnapshots.filter(snapshot => snapshot.id !== snapshotId));
    } catch (e: any) {
      if (globalDebugModeActive) console.error("[EditorDialog] Error deleting snapshot:", e.message);
      setTimeout(() => toast({ title: "Snapshot Delete Error", description: e.message, variant: "destructive" }), 0);
    }
  }, [openedTabs, globalDebugModeActive, toast]); // Removed activeTabPathRef


  const handleTabClose = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTabClose CALLED for ${tabToClosePath}`);
    
    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`File "${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
        return;
      }
    }

    setOpenedTabs(prevTabs => {
      const originalIndex = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);
      
      if (activeTabPathRef.current === tabToClosePath) {
        if (updatedTabs.length > 0) {
          // Try to activate the tab that was visually to the left, or the new last tab
          const newIndexToActivate = Math.max(0, Math.min(originalIndex -1, updatedTabs.length - 1));
          setActiveTabPath(updatedTabs[newIndexToActivate]?.path || null);
        } else {
          setActiveTabPath(null);
        }
      }
      return updatedTabs;
    });
  }, [openedTabs, globalDebugModeActive, setActiveTabPath]);


  const handleTreeFileClick = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeFileClick CALLED for: ${filePath}`);
    handleOpenOrActivateTab(filePath, fileName);
  }, [globalDebugModeActive, handleOpenOrActivateTab]);

  const handleTreeFolderClick = useCallback((folderPath: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeFolderClick CALLED for: ${folderPath}`);
    setFileTreePath(folderPath);
  }, [globalDebugModeActive, setFileTreePath]);
  
  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    if (currentTreeP === '/') return; // Already at root
    const parentDir = path.dirname(currentTreeP);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeBackClick. Current: ${currentTreeP}, Parent: ${parentDir}`);
    setFileTreePath(parentDir);
  }, [globalDebugModeActive, setFileTreePath]);

  // Derived for enabling/disabling tree back button
  const normalizedInitialBaseDir = useMemo(() => {
    if (!decodedFilePath) return null; // Use decodedFilePath which comes from filePathToEdit
    const initialBaseDir = path.dirname(decodedFilePath);
    return path.normalize(initialBaseDir === '.' ? '/' : initialBaseDir);
  }, [decodedFilePath]);

  const normalizedCurrentFileTreePath = useMemo(() => {
    return path.normalize(fileTreePath || '/');
  }, [fileTreePath]);

  const canGoBackInTree = useMemo(() => {
    // This logic might need refinement if filePathToEdit (and thus normalizedInitialBaseDir) can be null
    // and the user starts browsing from root.
    // If no specific file was opened initially, allow back as long as not at root.
    if (!filePathToEdit && normalizedCurrentFileTreePath !== '/') return true;
    if (!normalizedInitialBaseDir) return normalizedCurrentFileTreePath !== '/'; // Only check against root if no initial context

    return normalizedCurrentFileTreePath !== '/' && normalizedCurrentFileTreePath !== normalizedInitialBaseDir;
  }, [normalizedCurrentFileTreePath, filePathToEdit, normalizedInitialBaseDir]);



  const performSearch = useCallback((queryToSearch?: string) => {
    const currentSearchQuery = queryToSearch === undefined ? searchQuery : queryToSearch;
    const view = editorRef.current?.view;

    if (!view || !currentSearchQuery.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      if (globalDebugModeActive && currentSearchQuery.trim()) console.log("[EditorDialog] performSearch: Editor view not ready or query empty.");
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] performSearch CALLED with query: "${currentSearchQuery}", caseSensitive: ${isCaseSensitiveSearch}`);

    const cursor = new SearchCursor(
        view.state.doc,
        currentSearchQuery,
        0,
        view.state.doc.length,
        isCaseSensitiveSearch ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase()
    );
    
    const matchesFound: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) {
        matchesFound.push({ from: cursor.value.from, to: cursor.value.to });
    }
    
    setSearchMatches(matchesFound);

    if (matchesFound.length > 0) {
      setCurrentMatchIndex(0);
      // Use a timeout to ensure the editor has rendered with new content if search is triggered by content change
      setTimeout(() => {
         if (editorRef.current?.view) { // Re-check ref
            editorRef.current.view.dispatch({
                selection: EditorSelection.single(matchesFound[0].from, matchesFound[0].to),
                effects: EditorView.scrollIntoView(matchesFound[0].from, { y: "center" })
            });
         }
      }, 0);
    } else {
      setCurrentMatchIndex(-1);
      if (globalDebugModeActive) console.log("[EditorDialog] performSearch: No matches found.");
      // setTimeout(() => toast({ title: "Not Found", description: `"${currentSearchQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, globalDebugModeActive]);


  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (newQuery.trim() === "") {
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
         if (editorRef.current?.view) { // Clear selection if query is empty
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({
                selection: EditorSelection.single(currentSelection.anchor) // Deselect by setting a cursor
            });
        }
    } else {
      performSearch(newQuery);
    }
  }, [performSearch]);

  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    performSearch();
  }, [performSearch]);

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
    performSearch(term);
  }, [performSearch]);

  const toggleCaseSensitiveSearch = useCallback(() => {
    setIsCaseSensitiveSearch(prev => {
      const newSensitivity = !prev;
      // Re-run search with current query and new sensitivity
      performSearch(searchQuery); // performSearch will use the new isCaseSensitiveSearch value in its next execution
      return newSensitivity;
    });
     // We need performSearch to pick up the new isCaseSensitiveSearch value.
    // The state update is async, so call performSearch again after the state has likely updated.
    // A more robust way might be to pass newSensitivity directly to performSearch or use an effect.
    // For now, this should work for typical user interaction speeds.
    setTimeout(() => performSearch(searchQuery),0);

  }, [searchQuery, performSearch]);

  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] useEffect[isSearchWidgetOpen]: Widget Open:", isSearchWidgetOpen, "Search Matches:", searchMatches.length);
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        // When search widget closes, clear matches and potentially the selection in editor
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
        if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({
                selection: EditorSelection.single(currentSelection.anchor) // Deselect
            });
        }
    }
  }, [isSearchWidgetOpen, searchMatches.length, globalDebugModeActive]);


  // Dialog Dragging & Maximizing
  const handleMaximize = useCallback(() => {
    if (isMaximized) {
      setPosition(prevPosition);
    } else {
      setPrevPosition(position);
      setPosition({ x: 0, y: 0 });
    }
    setIsMaximized(!isMaximized);
  }, [isMaximized, position, prevPosition]);

  const handleMouseDownDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMaximized || e.target !== e.currentTarget) return; // Only drag if not maximized and mousedown is on the header itself
    setIsDragging(true);
    const dialogRect = dialogContentRef.current?.getBoundingClientRect();
    if (dialogRect) {
      setDragStart({
        x: e.clientX - dialogRect.left,
        y: e.clientY - dialogRect.top
      });
    } else {
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [isMaximized, position.x, position.y]);


  const handleMouseMoveDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || isMaximized) return;
    e.preventDefault();
    
    let newX = e.clientX - dragStart.x;
    let newY = e.clientY - dragStart.y;
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart, isMaximized]);

  const handleMouseUpDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMoveDrag);
      window.addEventListener('mouseup', handleMouseUpDrag);
      window.addEventListener('mouseleave', handleMouseUpDrag);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveDrag);
      window.removeEventListener('mouseup', handleMouseUpDrag);
      window.removeEventListener('mouseleave', handleMouseUpDrag);
    };
  }, [isDragging, handleMouseMoveDrag, handleMouseUpDrag]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        style={isMaximized ? {
          width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh',
          position: 'fixed', left: 0, top: 0, transform: 'none', margin: 0,
        } : {
          position: 'fixed', left: position.x, top: position.y, transform: 'none', margin: 0,
          width: 'min(90vw, 1200px)', height: 'min(85vh, 900px)',
        }}
        className={cn(
            "p-0 border-0 shadow-xl overflow-hidden bg-secondary text-foreground flex flex-col",
            isMaximized ? 'rounded-none' : 'rounded-lg'
        )}
      >
        <DialogHeader
          className="relative flex items-center justify-between border-b border-border p-3 pl-4 flex-shrink-0"
          style={{ cursor: isMaximized ? 'default' : 'move' }}
          onMouseDown={handleMouseDownDrag}
        >
          <DialogTitle className="text-base font-semibold truncate max-w-[calc(100%-100px)]">
            {activeTabData ? `File Editor: ${activeTabData.name}` : "File Editor"}
          </DialogTitle>
          <div className="flex items-center space-x-1">
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleMaximize} className="h-7 w-7">
                {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              </Button>
            </TooltipTrigger><TooltipContent><p>{isMaximized ? "Restore" : "Maximize"}</p></TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger><TooltipContent><p>Close Editor</p></TooltipContent></Tooltip></TooltipProvider>
          </div>
        </DialogHeader>

        {/* Tab Bar */}
        <div className="flex-shrink-0 border-b border-border bg-muted/50 overflow-x-auto no-scrollbar">
          <ScrollArea orientation="horizontal" className="h-auto whitespace-nowrap">
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
                      : "bg-secondary hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                  )}
                  style={{ paddingRight: '24px' }} // Ensure space for close button
                >
                  {tab.name}
                  {tab.unsavedChanges && <span className="ml-1.5 text-orange-400">*</span>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "absolute right-0.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm transition-opacity",
                       activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80",
                       "opacity-50 group-hover:opacity-100"
                    )}
                    onClick={(e) => handleTabClose(tab.path, e)}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Close {tab.name}</span>
                  </Button>
                </div>
              ))}
              {openedTabs.length === 0 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open. Select a file from the tree.</div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content Area (File Tree + Editor) */}
        <div className="flex flex-grow overflow-hidden min-h-0">
          {/* Left Panel: File Tree */}
          <div className="w-64 border-r border-border bg-muted/30 flex-shrink-0 flex flex-col min-h-0">
            <div className="p-2 border-b border-border flex items-center flex-shrink-0">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={!canGoBackInTree} className="h-7 w-7">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent><p>Go Up</p></TooltipContent></Tooltip></TooltipProvider>
              <ScrollArea orientation="horizontal" className="ml-2 flex-grow whitespace-nowrap">
                 <span className="text-xs font-medium truncate text-muted-foreground">{fileTreePathRef.current}</span>
              </ScrollArea>
            </div>
            <ScrollArea className="flex-grow p-1">
              {isFileTreeLoading ? (
                <div className="p-3 flex items-center justify-center text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading...
                </div>
              ) : fileTreeError ? (
                <Alert variant="destructive" className="m-2 text-xs">
                  <FileWarning className="h-3 w-3" />
                  <ShadcnAlertTitle className="text-xs font-semibold">Error</ShadcnAlertTitle>
                  <AlertDescription className="text-xs">{fileTreeError}</AlertDescription>
                </Alert>
              ) : (
                <ul>
                  {fileTreeItems.map((item) => (
                    <li key={item.name}
                        className="px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs"
                        onClick={() => item.type === 'folder' ? handleTreeFolderClick(path.join(fileTreePathRef.current, item.name)) : handleTreeFileClick(path.join(fileTreePathRef.current, item.name), item.name)}>
                      <div className="flex items-center space-x-2">
                        {getFileIcon(item.name, item.type)}
                        <span className="truncate">{item.name}</span>
                      </div>
                    </li>
                  ))}
                  {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && (
                    <li className="px-2 py-1 text-xs text-muted-foreground">Empty directory.</li>
                  )}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Right Panel: Editor and Toolbar */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {activeTabData ? (
              <>
                {/* Editor Toolbar */}
                <div className="flex items-center justify-between p-2 border-b border-border bg-muted/50 flex-shrink-0">
                  <div className="flex items-center space-x-1">
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon"
                        onClick={handleSaveChanges}
                        disabled={isEditorSaving || !isCurrentFileWritable || (!hasUnsavedChanges && !globalDebugModeActive)}
                        isLoading={isEditorSaving}
                        className="h-7 w-7"
                      >
                         <Save className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(prev => !prev)} className="h-7 w-7">
                        <SearchIconLucide className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent><p>Find (Ctrl+F)</p></TooltipContent></Tooltip></TooltipProvider>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground truncate">
                    <span className="truncate max-w-[150px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg">{activeTabData.path}</span>
                    <span>|</span>
                    <span>{editorLanguage}</span>
                    <span>|</span>
                    <span>{editorContent.length} chars</span>
                    <span>|</span>
                    <span>{editorContent.split('\n').length} lines</span>
                    {hasUnsavedChanges && <span className="text-orange-400 font-semibold ml-2">* Unsaved</span>}
                     <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                         <TooltipProvider><Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={!activeTabData} className="h-7 w-7">
                              <Camera className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger><TooltipContent><p>Snapshots</p></TooltipContent></Tooltip></TooltipProvider>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel className="text-xs">File Snapshots</DropdownMenuLabel>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-0">(Max {MAX_SERVER_SNAPSHOTS} server-side)</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isLoadingSnapshots ? (
                          <DropdownMenuItem disabled className="text-xs"><Loader2 className="mr-2 h-3 w-3 animate-spin" />Loading...</DropdownMenuItem>
                        ) : snapshotError ? (
                          <DropdownMenuItem disabled className="text-xs text-destructive"><AlertTriangle className="mr-2 h-3 w-3" />{snapshotError}</DropdownMenuItem>
                        ) : serverSnapshots.length === 0 ? (
                          <DropdownMenuItem disabled className="text-xs">No server snapshots.</DropdownMenuItem>
                        ) : (
                          <ScrollArea className="max-h-48">
                            {serverSnapshots.map((snapshot) => (
                              <DropdownMenuItem key={snapshot.id} onSelect={(e) => e.preventDefault()} className="flex justify-between items-center text-xs p-1.5">
                                <div className="flex flex-col items-start cursor-pointer flex-grow" onClick={() => handleSnapshotSelect(snapshot)}>
                                  <span className={cn(snapshot.isLocked && "font-semibold")}>
                                    {formatDistanceToNowStrict(new Date(snapshot.timestamp), { addSuffix: true })}
                                    {snapshot.isLocked && <Lock className="inline h-3 w-3 ml-1 text-amber-500" />}
                                  </span>
                                  <span className="text-muted-foreground text-[0.65rem]">{format(new Date(snapshot.timestamp), 'MMM dd, yyyy h:mm a')}</span>
                                </div>
                                <div className="flex items-center shrink-0 ml-2">
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotSelect(snapshot)}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View</p></TooltipContent></Tooltip></TooltipProvider>
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotLock(snapshot.id, !!snapshot.isLocked)}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider>
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground" onClick={() => handleDeleteSnapshot(snapshot.id)}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider>
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </ScrollArea>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => { setTimeout(() => handleCreateSnapshot(), 0); }}
                          disabled={isCreatingSnapshot || (!globalDebugModeActive && !hasUnsavedChanges)}
                          className="text-xs"
                        >
                          {isCreatingSnapshot ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <Camera className="mr-2 h-3 w-3" />}
                          Create Snapshot {(globalDebugModeActive && !hasUnsavedChanges) ? "(Debug)" : ""}
                        </DropdownMenuItem>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground pt-1">Snapshots expire unless locked.</DropdownMenuLabel>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Editor Area */}
                <div className="flex-grow relative p-0 bg-background min-h-0">
                  {isEditorLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...
                    </div>
                  ) : activeTabData.error ? ( // Check tab-specific error first
                    <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-6 w-6 mb-2" />
                      <ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle>
                      <AlertDescription>{activeTabData.error}</AlertDescription>
                       <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                          setOpenedTabs(prev => prev.map(t => t.path === activeTabPath ? {...t, isLoading: true, error: null, content: null, originalContent: null} : t));
                       }}>Retry</Button>
                    </Alert>
                  ) : editorError ? ( // Then check general editor error
                     <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-6 w-6 mb-2" />
                      <ShadcnAlertTitle>Editor Error</ShadcnAlertTitle>
                      <AlertDescription>{editorError}</AlertDescription>
                    </Alert>
                  ) : (
                    <CodeEditor
                      ref={editorRef}
                      value={editorContent}
                      language={editorLanguage}
                      onChange={handleEditorContentChange}
                      readOnly={isEditorSaving || !isCurrentFileWritable}
                      className="h-full w-full border-0 rounded-none"
                    />
                  )}
                  {/* Search Widget */}
                  {isSearchWidgetOpen && activeTabData && !isEditorLoading && !activeTabData.error && !editorError && (
                    <div className="absolute top-2 right-2 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                      <div className="flex items-center gap-1">
                        <Input
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
                          </TooltipTrigger><TooltipContent>Previous</TooltipContent></Tooltip></TooltipProvider>
                          <TooltipProvider><Tooltip><TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6">
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Next</TooltipContent></Tooltip></TooltipProvider>
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
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
                <p>{filePathToEdit && !decodedFilePath ? "Error decoding file path from URL." : "Select a file from the tree or open a tab to start editing."}</p>
              </div>
            )}
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

```