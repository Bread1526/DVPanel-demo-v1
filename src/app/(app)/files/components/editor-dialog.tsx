
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle, // Keep this for the sr-only title
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor'; // Corrected import
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
  Replace as ReplaceIcon,
  Sparkles as SparklesIcon,
  Palette as PaletteIcon,
  Settings2 as EditorSettingsIcon,
  HelpCircle as HelpCircleIcon,
  Camera,
  PanelLeftClose,
  PanelRightClose,
  Menu,
  FileX2,
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
import { SearchCursor, openSearchPanel } from '@codemirror/search';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';


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
  originalContent: string | null;
  language: string;
  isWritable: boolean | null;
  isLoading: boolean;
  error?: string | null;
  unsavedChanges?: boolean;
}

interface FileItemForTree {
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
}

interface EditorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filePathToEdit: string | null;
}

const MAX_SERVER_SNAPSHOTS = 10;
const PRESET_SEARCH_TERMS = ["TODO", "FIXME", "NOTE"];
const CONTENT_FETCH_TIMEOUT_MS = 20000; // 20 seconds

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
  const dialogContentRef = useRef<HTMLDivElement>(null); // For potential future use with dragging constraints

  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null);

  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const fileTreePathRef = useRef<string>('/');
  const [fileTreePathInput, setFileTreePathInput] = useState<string>('/');
  const initialDirForResetRef = useRef<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);

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

  const [isSavingAll, setIsSavingAll] = useState(false);
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);

  const dialogTitleId = React.useId(); // For accessible dialog title

  const setActiveTabPath = useCallback((newActivePath: string | null) => {
    if (globalDebugModeActive) console.log('[EditorDialog] setActiveTabPath called with:', newActivePath);
    activeTabPathRef.current = newActivePath;
    setActiveTabPathInternal(newActivePath);
  }, [globalDebugModeActive]);

  const setFileTreePath = useCallback((newPath: string) => {
    let normalizedPath = path.normalize(newPath);
    if (normalizedPath === '.' || normalizedPath === '') normalizedPath = '/';
    if (normalizedPath !== '/' && normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }
    if (globalDebugModeActive) console.log('[EditorDialog] setFileTreePath called. Old:', fileTreePathRef.current, 'New:', newPath, 'Normalized:', normalizedPath);
    fileTreePathRef.current = normalizedPath;
    setFileTreePathInternal(normalizedPath);
    setFileTreePathInput(normalizedPath);
  }, [globalDebugModeActive]);

  const activeTabData = useMemo(() => {
    if (!activeTabPathRef.current) return null;
    return openedTabs.find(tab => tab.path === activeTabPathRef.current) || null;
  }, [openedTabs, activeTabPath]);

  const editorContentForActiveTab = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguageForActiveTab = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const hasUnsavedChangesForActiveTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);


  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems CALLED for path: ${pathToDisplay}`);
    setIsFileTreeLoading(true);
    setFileTreeError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToDisplay)}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (fileTreePathRef.current !== pathToDisplay && isOpen) {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems for ${pathToDisplay} STALE (current is ${fileTreePathRef.current}). Aborting UI update.`);
        setIsFileTreeLoading(false); // Still ensure loading is false for the original path
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : { error: `Status: ${response.status}` }; }
        catch { errData = { error: `Status: ${response.status}. Response: ${errText.substring(0,100)}...` }; }
        throw new Error(errData.error || `List directory failed. Status: ${response.status}`);
      }
      const data = await response.json();
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems RESPONSE for path: ${pathToDisplay}`, data);

      if (isOpen && fileTreePathRef.current === pathToDisplay) {
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        if (data.path && data.path !== fileTreePathInput) {
             setFileTreePathInput(data.path);
        }
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (isOpen && fileTreePathRef.current === pathToDisplay) {
        const errorMsg = e.name === 'AbortError' ? 'Timeout fetching file tree.' : (e.message || "Error fetching file tree.");
        if (globalDebugModeActive) console.error(`[EditorDialog] fetchFileTreeItems ERROR for ${pathToDisplay}:`, errorMsg);
        setFileTreeError(errorMsg);
        setFileTreeItems([]);
      }
    } finally {
       if (isOpen && fileTreePathRef.current === pathToDisplay) {
        setIsFileTreeLoading(false);
      }
    }
  }, [isOpen, globalDebugModeActive, fileTreePathInput]);

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName?: string) => {
    const resolvedFileName = fileName || path.basename(filePath);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab CALLED for: ${filePath}, name: ${resolvedFileName}`);

    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      let newTabsList;
      if (existingTabIndex !== -1) {
        const existingTab = prevTabs[existingTabIndex];
        newTabsList = [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
        if (globalDebugModeActive) console.log(`[EditorDialog] Tab ${filePath} already open, moving to end.`);
      } else {
        newTabsList = [...prevTabs, {
          path: filePath,
          name: resolvedFileName,
          content: null,
          originalContent: null,
          language: getLanguageFromFilename(resolvedFileName),
          isWritable: null,
          isLoading: false, // Will be set to true by the effect that fetches content
          error: null,
          unsavedChanges: false,
        }];
        if (globalDebugModeActive) console.log(`[EditorDialog] Tab ${filePath} is new, adding.`);
      }
      return newTabsList;
    });
    setActiveTabPath(filePath);
  }, [setActiveTabPath, globalDebugModeActive]);

  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Main Initialization effect triggered. isOpen:", isOpen, "filePathToEdit:", filePathToEdit);
    if (isOpen) {
      loadPanelSettings().then(settingsResult => {
        if (settingsResult.data) {
          setGlobalDebugModeActive(settingsResult.data.debugMode ?? false);
          if (globalDebugModeActive || settingsResult.data.debugMode) console.log("[EditorDialog] Global debug mode from settings:", settingsResult.data.debugMode);
        }
      });

      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        initialDirForResetRef.current = normalizedInitialDir;
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: Setting initialDirForResetRef to ${normalizedInitialDir}`);
        setFileTreePath(normalizedInitialDir);
        // Direct call fetchFileTreeItems for initial load to avoid race conditions with state update
        if(normalizedInitialDir !== fileTreePathRef.current) { // Only if path actually changes
             fetchFileTreeItems(normalizedInitialDir);
        }
        handleOpenOrActivateTab(filePathToEdit);
      } else {
        const defaultInitialDir = (activeTabPathRef.current && path.dirname(activeTabPathRef.current)) || '/';
        const normalizedDefaultDir = path.normalize(defaultInitialDir === '.' ? '/' : defaultInitialDir);
        initialDirForResetRef.current = normalizedDefaultDir;

        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing (no filePathToEdit): Setting initialDirForResetRef to ${normalizedDefaultDir}. Current tree path: ${fileTreePathRef.current}`);
        
        if (fileTreePathRef.current !== normalizedDefaultDir || fileTreeItems.length === 0) { // Fetch if path different or no items
          setFileTreePath(normalizedDefaultDir);
          if(normalizedDefaultDir !== fileTreePathRef.current) {
            fetchFileTreeItems(normalizedDefaultDir);
          }
        }
        
        if (openedTabs.length > 0 && !activeTabPathRef.current) {
          setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
           setActiveTabPath(null);
        }
      }
      setIsSearchWidgetOpen(false); setSearchQuery(""); setSearchMatches([]); setCurrentMatchIndex(-1);
    } else {
        // When dialog closes, reset potentially sensitive state
        setOpenedTabs([]);
        setActiveTabPath(null);
        setFileTreePath('/');
        setFileTreeItems([]);
        setFileTreeError(null);
        setServerSnapshots([]);
    }
  }, [isOpen, filePathToEdit, handleOpenOrActivateTab, setFileTreePath, setActiveTabPath, globalDebugModeActive, fetchFileTreeItems]); // Removed fileTreeItems from deps

  useEffect(() => {
    if (isOpen && fileTreePath !== fileTreePathRef.current && fileTreePathRef.current !== undefined) { // Only fetch if path truly changes
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen] - Tree Path state changed to: ${fileTreePath}. Triggering fetchFileTreeItems.`);
        fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);

   // Effect to fetch content for the active tab
  useEffect(() => {
    const currentActiveTabPath = activeTabPathRef.current;
    if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs] START. Active path: ${currentActiveTabPath}, Num open tabs: ${openedTabs.length}`);
    
    if (!currentActiveTabPath || !isOpen) {
      if (globalDebugModeActive && !currentActiveTabPath) console.log("[EditorDialog] useEffect[activeTabPath]: No active tab path, skipping content fetch.");
      return;
    }

    const activeTabIndex = openedTabs.findIndex(tab => tab.path === currentActiveTabPath);
    if (activeTabIndex === -1) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Active tab ${currentActiveTabPath} not found in openedTabs. Might be closing.`);
      return;
    }

    const tabToLoad = openedTabs[activeTabIndex];

    // Only fetch if content is null and not already loading and no error
    if (tabToLoad.content === null && !tabToLoad.isLoading && !tabToLoad.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Tab ${currentActiveTabPath} needs content. Starting fetch.`);
      
      // Set loading state for this specific tab
      setOpenedTabs(prevTabs => prevTabs.map((t) =>
        t.path === currentActiveTabPath ? { ...t, isLoading: true, error: null } : t
      ));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        if (globalDebugModeActive) console.log(`[EditorDialog] Content fetch for ${currentActiveTabPath} TIMEOUT after ${CONTENT_FETCH_TIMEOUT_MS}ms.`);
      }, CONTENT_FETCH_TIMEOUT_MS);

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActiveTabPath)}&view=true`, { signal: controller.signal })
        .then(async response => {
          clearTimeout(timeoutId);
          // Stale check: if active tab changed during fetch, abort UI update for this old fetch
          if (activeTabPathRef.current !== currentActiveTabPath && isOpen) {
             if (globalDebugModeActive) console.log(`[EditorDialog] Content fetch for ${currentActiveTabPath} STALE (active is ${activeTabPathRef.current}). Aborting UI update.`);
             return null; 
          }
          if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try { errorJson = errorText ? JSON.parse(errorText) : {error: `HTTP ${response.status}`}; }
            catch { errorJson = {error: `Server Error ${response.status}: ${errorText.substring(0,100)}...`};}
            throw new Error(errorJson.error || `Failed to load content.`);
          }
          return response.json();
        })
        .then(data => {
          if (data && isOpen && activeTabPathRef.current === currentActiveTabPath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] Content fetch for ${currentActiveTabPath} SUCCESS. Writable: ${data.writable}`);
            setOpenedTabs(prevTabs => prevTabs.map((t) =>
              t.path === currentActiveTabPath
              ? { ...t, content: data.content, originalContent: data.content, isWritable: data.writable, isLoading: false, error: null, unsavedChanges: false }
              : t
            ));
            fetchSnapshots(currentActiveTabPath); 
          }
        })
        .catch((e: any) => {
          clearTimeout(timeoutId);
          if (isOpen && activeTabPathRef.current === currentActiveTabPath) { 
            const errorMsg = e.name === 'AbortError' ? 'Timeout fetching content.' : (e.message || "Failed to load content.");
            if (globalDebugModeActive) console.error(`[EditorDialog] Content fetch for ${currentActiveTabPath} ERROR:`, errorMsg);
            setOpenedTabs(prevTabs => prevTabs.map((t) =>
              t.path === currentActiveTabPath ? { ...t, isLoading: false, error: errorMsg, content: "" } : t
            ));
          }
        });
    } else if (tabToLoad.content !== null && !tabToLoad.isLoading && !tabToLoad.error && activeTabPathRef.current === tabToLoad.path) {
      // Content is already loaded, ensure snapshots are fetched if needed
      if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError) {
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content exists for ${currentActiveTabPath}. Triggering snapshot fetch if needed.`);
        fetchSnapshots(currentActiveTabPath);
      }
    } else if (tabToLoad.isLoading) {
       if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Tab ${currentActiveTabPath} is already loading.`);
    } else if (tabToLoad.error) {
       if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Tab ${currentActiveTabPath} has an error: ${tabToLoad.error}`);
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive]); // fetchSnapshots is a dependency if its definition changes

  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) {
      setServerSnapshots([]);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots CALLED for: ${filePathForSnapshots}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (activeTabPathRef.current !== filePathForSnapshots && isOpen) { 
         if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots for ${filePathForSnapshots} STALE (active is ${activeTabPathRef.current}). Aborting UI update.`);
         setIsLoadingSnapshots(false);
         return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch { errorJson = { error: `Snapshots load error. Status: ${response.status}` }; }
        throw new Error(errorJson.error || "Failed to fetch snapshots.");
      }
      const data = await response.json();
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots RESPONSE for: ${filePathForSnapshots}`, data);

      if (isOpen && activeTabPathRef.current === filePathForSnapshots) { 
        const snapshots = Array.isArray(data.snapshots) ? data.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];
        setServerSnapshots(snapshots);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (isOpen && activeTabPathRef.current === filePathForSnapshots) { 
        const errorMsg = e.name === 'AbortError' ? 'Timeout fetching snapshots.' : (e.message || "Error fetching snapshots.");
        if (globalDebugModeActive) console.error(`[EditorDialog] fetchSnapshots ERROR for ${filePathForSnapshots}:`, errorMsg);
        setSnapshotError(errorMsg);
        setTimeout(() => toast({ title: "Snapshot Load Error", description: errorMsg, variant: "destructive" }), 0);
      }
    } finally {
       if (isOpen && activeTabPathRef.current === filePathForSnapshots) { 
        setIsLoadingSnapshots(false);
      }
    }
  }, [isOpen, toast, globalDebugModeActive]);

  useEffect(() => {
    if (fileTreeError && isOpen) {
      const currentTreeP = fileTreePathRef.current;
      const initialDirToUseForReset = initialDirForResetRef.current;
      if (globalDebugModeActive) console.log(`[EditorDialog] File tree error detected: "${fileTreeError}". Current tree path: "${currentTreeP}", Initial base: "${initialDirToUseForReset}"`);
      
      setTimeout(() => {
        toast({ title: "Invalid Path", description: `Path "${currentTreeP}" not found or error: ${fileTreeError}. Reverting to "${initialDirToUseForReset}".`, variant: "destructive", duration: 5000 });
      },0);
      
      if (currentTreeP !== initialDirToUseForReset) {
        setFileTreePath(initialDirToUseForReset); // This will trigger fetchFileTreeItems via its own effect
      } else {
        fetchFileTreeItems(initialDirToUseForReset); // Re-fetch if error was on base path
      }
      setFileTreeError(null); 
    }
  }, [fileTreeError, isOpen, toast, setFileTreePath, globalDebugModeActive, fetchFileTreeItems]);

  const handleCloseDialog = useCallback(() => {
    if (anyUnsavedFiles) {
      if (!window.confirm("You have unsaved changes. Close editor anyway?")) return;
    }
    setOpenedTabs([]); // Clear tabs on close
    setActiveTabPath(null);
    onOpenChange(false);
  }, [anyUnsavedFiles, onOpenChange]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    setOpenedTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.path === currentActiveP
        ? { ...tab, content: newContent, unsavedChanges: newContent !== tab.originalContent }
        : tab
      )
    );
  }, []);

  const handleSaveChanges = useCallback(async (tabPathToSave?: string) => {
    const currentActiveP = activeTabPathRef.current;
    const pathToSave = tabPathToSave || currentActiveP;

    if (!pathToSave) {
      setTimeout(() => toast({ title: "Save Error", description: "No active file to save.", variant: "destructive" }),0);
      return { success: false };
    }

    const tabIndex = openedTabs.findIndex(t => t.path === pathToSave);
    if (tabIndex === -1) {
      setTimeout(() => toast({ title: "Save Error", description: `File ${pathToSave} not found in open tabs.`, variant: "destructive" }),0);
      return { success: false };
    }
    const tabData = openedTabs[tabIndex];

    if (tabData.content === null || !tabData.isWritable) {
      setTimeout(() => toast({ title: "Save Error", description: `Cannot save ${tabData.name}: File not writable or no content.`, variant: "destructive" }),0);
      return { success: false };
    }
    
    const shouldCreateSnapshotBeforeSave = (tabData.unsavedChanges || (globalDebugModeActive && !tabData.unsavedChanges));

    if (shouldCreateSnapshotBeforeSave && pathToSave === currentActiveP) {
        if(globalDebugModeActive) console.log(`[EditorDialog] Auto-snapshotting ${pathToSave} before save. Unsaved: ${tabData.unsavedChanges}, Debug: ${globalDebugModeActive}`);
        try {
            const snapshotResponse = await fetch(`/api/panel-daemon/snapshots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: pathToSave, content: tabData.content, language: tabData.language })
            });
            if (!snapshotResponse.ok) {
                const snapError = await snapshotResponse.json().catch(() => ({ error: "Unknown pre-save snapshot error" }));
                if(globalDebugModeActive) console.warn("[EditorDialog] Pre-save snapshot failed:", snapError.error);
            } else {
                if(globalDebugModeActive) console.log("[EditorDialog] Pre-save snapshot successful for", pathToSave);
                if(activeTabPathRef.current === pathToSave) fetchSnapshots(pathToSave); // Refresh snapshot list for current tab
            }
        } catch (e: any) {
            if(globalDebugModeActive) console.error("[EditorDialog] Pre-save snapshot exception:", e.message);
        }
    }
    
    setOpenedTabs(prev => prev.map((t, i) => i === tabIndex ? { ...t, isLoading: true } : t));

    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tabData.path, content: tabData.content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');

      setTimeout(() => toast({ title: 'Success', description: `File ${tabData.name} saved.` }),0);
      setOpenedTabs(prev => prev.map((t, i) =>
        i === tabIndex ? { ...t, originalContent: t.content, unsavedChanges: false, isLoading: false, isWritable: true, error: null } : t
      ));
      return { success: true };
    } catch (e: any) {
      setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }),0);
      setOpenedTabs(prev => prev.map((t, i) => i === tabIndex ? { ...t, isLoading: false, error: e.message } : t));
      return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, toast, fetchSnapshots]);

  const handleSaveAll = useCallback(async () => {
    setIsSavingAll(true);
    let successCount = 0;
    let errorCount = 0;
    const tabsToProcess = [...openedTabs];

    for (const tab of tabsToProcess) {
      if (tab.unsavedChanges || globalDebugModeActive) {
        const result = await handleSaveChanges(tab.path);
        if (result.success) successCount++;
        else errorCount++;
      }
    }
    setIsSavingAll(false);
    const message = errorCount > 0
      ? `${successCount} saved. ${errorCount} failed.`
      : `${successCount} file(s) saved successfully.`;
    setTimeout(() => toast({ title: "Save All Complete", description: message, variant: errorCount > 0 ? "destructive" : "default" }),0);
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);

  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`"${tabToClose.name}" has unsaved changes. Close anyway?`)) return;
    }

    setOpenedTabs(prevTabs => {
      const indexToClose = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);
      if (activeTabPathRef.current === tabToClosePath) {
        if (updatedTabs.length > 0) {
          const newIndexToActivate = Math.max(0, indexToClose -1);
          setActiveTabPath(updatedTabs[newIndexToActivate < updatedTabs.length ? newIndexToActivate : updatedTabs.length -1]?.path || null);
        } else {
          setActiveTabPath(null);
        }
      }
      return updatedTabs;
    });
  }, [openedTabs, setActiveTabPath]);

  const handleTreeFolderClick = useCallback((folderName: string) => {
    const newPath = path.join(fileTreePathRef.current, folderName);
    setFileTreePath(newPath);
  }, [setFileTreePath]);

  const handleTreeFileClick = useCallback((filePath: string, fileName: string) => {
    handleOpenOrActivateTab(filePath, fileName);
  }, [handleOpenOrActivateTab]);

  const handleFileTreePathSubmit = useCallback(() => {
    let trimmedPath = fileTreePathInput.trim();
    if (!trimmedPath.startsWith('/')) trimmedPath = '/' + trimmedPath;
    const normalized = path.normalize(trimmedPath);
    const newTreePath = normalized === '.' || normalized === '' ? '/' : normalized;
    
    if (newTreePath !== fileTreePathRef.current) {
      setFileTreePath(newTreePath);
    }
  }, [fileTreePathInput, setFileTreePath]);

  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    if (currentTreeP === '/' || currentTreeP === '.') return;
    let parentDir = path.dirname(currentTreeP);
    parentDir = parentDir === '.' || parentDir === '' ? '/' : parentDir;
    
    const baseForComparison = initialDirForResetRef.current;
    if (filePathToEdit && baseForComparison !== '/' && !parentDir.startsWith(baseForComparison) && parentDir !== baseForComparison) {
        setFileTreePath(baseForComparison);
        return;
    }
    setFileTreePath(parentDir);
  }, [setFileTreePath, filePathToEdit]);

  const handleCreateSnapshot = useCallback(async () => {
    const currentActiveP = activeTabPathRef.current;
    const currentTab = openedTabs.find(t => t.path === currentActiveP);
    if (!currentTab || currentTab.content === null) {
      setTimeout(() => toast({ title: "Snapshot Error", description: "No active file content.", variant: "destructive" }),0);
      return;
    }
    setIsCreatingSnapshot(true);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentActiveP, content: currentTab.content, language: currentTab.language })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create snapshot.');
      setTimeout(() => toast({ title: 'Snapshot Created', description: `Server snapshot for ${currentTab.name} created.` }),0);
      setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e: any) {
      setSnapshotError(e.message);
      setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }),0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [openedTabs, toast, fetchSnapshots]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = serverSnapshots.find(s => s.id === snapshotId);
    const currentActiveP = activeTabPathRef.current;
    if (!snapshotToLoad || !currentActiveP) return;
    setOpenedTabs(prevTabs => prevTabs.map(tab =>
      tab.path === currentActiveP
      ? { ...tab, content: snapshotToLoad.content, originalContent: snapshotToLoad.content, language: snapshotToLoad.language, unsavedChanges: false, error: null, isLoading: false }
      : tab
    ));
    setTimeout(() => toast({ title: "Snapshot Loaded" }),0);
  }, [serverSnapshots, toast]);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update lock status.');
      setTimeout(() => toast({ title: 'Lock Updated', description: `Snapshot ${!isCurrentlyLocked ? 'locked' : 'unlocked'}.` }),0);
      setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e: any) {
      setTimeout(() => toast({ title: "Lock Error", description: e.message, variant: "destructive" }),0);
      fetchSnapshots(currentActiveP);
    }
  }, [serverSnapshots, toast, fetchSnapshots]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    const snapshotToDelete = serverSnapshots.find(s => s.id === snapshotId);
    if (snapshotToDelete?.isLocked) {
      setTimeout(() => toast({ title: "Cannot Delete", description: "Locked snapshots cannot be deleted.", variant: "destructive" }),0); return;
    }
    if (!window.confirm("Are you sure you want to delete this server snapshot?")) return;
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete snapshot.');
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: 'Server snapshot removed.' }),0);
      setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e: any) {
      setTimeout(() => toast({ title: "Delete Error", description: e.message, variant: "destructive" }),0);
      fetchSnapshots(currentActiveP);
    }
  }, [serverSnapshots, toast, fetchSnapshots]);

  const handleViewSnapshotInPopup = useCallback((snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  }, []);

  const performSearch = useCallback((query?: string, caseSensitive?: boolean) => {
    const view = editorRef.current?.view;
    const currentQuery = (query !== undefined ? query : searchQuery).trim();
    const currentCaseSensitive = caseSensitive !== undefined ? caseSensitive : isCaseSensitiveSearch;

    if (!view || !currentQuery) {
      setSearchMatches([]); setCurrentMatchIndex(-1); return;
    }
    const cursor = new SearchCursor(view.state.doc, currentQuery, 0, view.state.doc.length, currentCaseSensitive ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase());
    const matchesFound: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) { matchesFound.push({ from: cursor.value.from, to: cursor.value.to }); }
    setSearchMatches(matchesFound);

    if (matchesFound.length > 0) {
      setCurrentMatchIndex(0);
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
      setTimeout(() => toast({ title: "Not Found", description: `"${currentQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, toast]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim()) {
      performSearch(e.target.value, isCaseSensitiveSearch);
    } else {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [performSearch, isCaseSensitiveSearch]);

  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) performSearch();
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
    performSearch(term, isCaseSensitiveSearch);
  }, [performSearch, isCaseSensitiveSearch]);

  const toggleCaseSensitiveSearch = useCallback(() => {
    setIsCaseSensitiveSearch(prev => {
      performSearch(searchQuery, !prev);
      return !prev;
    });
  }, [performSearch, searchQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' && !(activeElement as HTMLInputElement).closest('.cm-editor');

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        const currentActiveTab = openedTabs.find(t => t.path === activeTabPathRef.current);
        if (currentActiveTab && (currentActiveTab.isWritable ?? false) && !currentActiveTab.isLoading && !isSavingAll) {
          if (event.shiftKey) {
            handleSaveAll();
          } else {
            handleSaveChanges();
          }
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        if (!isInputFocused || activeElement?.closest('.cm-editor')) {
          event.preventDefault();
          setIsSearchWidgetOpen(prev => !prev);
          if (!isSearchWidgetOpen) {
            setTimeout(() => {
              const searchInput = document.getElementById("editor-search-input") as HTMLInputElement | null;
              searchInput?.focus();
              searchInput?.select();
            }, 0);
          }
        }
      }
      if (event.key === 'Escape') {
        if (isSearchWidgetOpen) { event.preventDefault(); event.stopPropagation(); setIsSearchWidgetOpen(false); }
        else if (isSnapshotViewerOpen) { /* Handled by dialog */ }
        else if (isOpen) { event.preventDefault(); handleCloseDialog(); }
      }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openedTabs, isSavingAll, handleSaveAll, handleSaveChanges, isSearchWidgetOpen, isSnapshotViewerOpen, handleCloseDialog, activeTabData]);

  useEffect(() => {
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      if (editorRef.current?.view) {
        const currentSelection = editorRef.current.view.state.selection.main;
        if (currentSelection.from !== currentSelection.to) {
          editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
      }
    }
  }, [isSearchWidgetOpen, searchMatches.length]);

  const treeBackButtonDisabled = useMemo(() => {
    if (isFileTreeLoading) return true;
    const currentTree = fileTreePathRef.current || '/';
    const baseDir = initialDirForResetRef.current || (filePathToEdit ? path.dirname(filePathToEdit) : '/');
    const normalizedBase = path.normalize(baseDir === '.' ? '/' : baseDir);
    if (currentTree === normalizedBase && filePathToEdit !== null && filePathToEdit !== '/') { // Ensure this condition also checks if filePathToEdit is not root itself
        return true;
    }
    return currentTree === '/';
  }, [isFileTreeLoading, filePathToEdit, fileTreePath]);

  const saveButtonDisabled = useMemo(() => isSavingAll || !activeTabData || activeTabData.isLoading || !isCurrentFileWritable || (!hasUnsavedChangesForActiveTab && !globalDebugModeActive) || !!activeTabData.error, [isSavingAll, activeTabData, isCurrentFileWritable, hasUnsavedChangesForActiveTab, globalDebugModeActive]);
  const saveAllButtonDisabled = useMemo(() => isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive), [isSavingAll, anyUnsavedFiles, globalDebugModeActive]);
  const createSnapshotButtonDisabled = useMemo(() => {
    const maxSnapshots = MAX_SERVER_SNAPSHOTS;
    return isCreatingSnapshot || !activeTabData || !activeTabData.content || activeTabData.isLoading || !!activeTabData.error || serverSnapshots.length >= maxSnapshots;
  }, [isCreatingSnapshot, activeTabData, serverSnapshots.length]);

  const toolbarButtons = [
    { id: 'save', label: 'Save', icon: Save, onClick: () => handleSaveChanges(), disabled: saveButtonDisabled, isLoading: activeTabData?.isLoading && !isSavingAll && activeTabData?.path === activeTabPathRef.current && !activeTabData.error && !activeTabData.unsavedChanges, tooltip: "Save (Ctrl+S)" },
    { id: 'saveAll', label: 'Save All', icon: SaveAll, onClick: handleSaveAll, disabled: saveAllButtonDisabled, isLoading: isSavingAll, tooltip: "Save All (Ctrl+Shift+S)" },
    { id: 'find', label: 'Find', icon: SearchIconLucide, onClick: () => { setIsSearchWidgetOpen(prev => !prev); if (!isSearchWidgetOpen) { setTimeout(() => { const el = document.getElementById("editor-search-input"); if(el) (el as HTMLInputElement).focus(); },0); } }, disabled: !activeTabData || !!activeTabData.error, tooltip: "Find (Ctrl+F)" },
    { id: 'snapshots', label: 'Snapshots', icon: Camera, dropdown: true, disabled: !activeTabData || !!activeTabData.error || isLoadingSnapshots, tooltip: "Snapshots" },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, onClick: () => { if(activeTabPathRef.current) { const path = activeTabPathRef.current; setOpenedTabs(p => p.map(t=> t.path === path ? {...t, content: null, originalContent: null, error: null, isLoading: false, unsavedChanges: false} : t)); setTimeout(() => setActiveTabPath(path), 0); } }, tooltip: "Reload File", disabled: !activeTabData || activeTabData.isLoading },
    { id: 'replace', label: 'Replace', icon: ReplaceIcon, onClick: () => setTimeout(()=>toast({title:"Replace: Not Implemented"}),0), tooltip: "Replace (Not Implemented)", disabled: true },
    { id: 'jumpline', label: 'Jump', icon: SparklesIcon, onClick: () => setTimeout(()=>toast({title:"Jump to Line: Not Implemented"}),0), tooltip: "Jump to Line (Not Implemented)", disabled: true },
    { id: 'font', label: 'Font', icon: PaletteIcon, onClick: () => setTimeout(()=>toast({title:"Font Settings: Not Implemented"}),0), tooltip: "Font Settings (Not Implemented)", disabled: true },
    { id: 'theme', label: 'Theme', icon: EditorSettingsIcon, onClick: () => setTimeout(()=>toast({title:"Editor Theme: Not Implemented"}),0), tooltip: "Change Theme (Not Implemented)", disabled: true },
    { id: 'help', label: 'Help', icon: HelpCircleIcon, onClick: () => setTimeout(()=>toast({title:"Editor Help: Not Implemented"}),0), tooltip: "Help (Not Implemented)", disabled: true },
  ];

  const activeFileDisplayPath = useMemo(() => activeTabData?.path || "No file active", [activeTabData]);
  const activeFileLang = useMemo(() => activeTabData?.language ? activeTabData.language.charAt(0).toUpperCase() + activeTabData.language.slice(1) : "N/A", [activeTabData]);
  const activeFileCharCount = useMemo(() => activeTabData?.content?.length ?? 0, [activeTabData]);
  const activeFileLinesCount = useMemo(() => activeTabData?.content?.split('\n').length ?? 0, [activeTabData]);
  const activeFileUnsaved = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const activeFileReadOnly = useMemo(() => activeTabData?.isWritable === false, [activeTabData]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        hideCloseButton={true}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-250px)] h-[calc(100vh-30px)] max-w-7xl max-h-[calc(100vh-100px)] p-0 overflow-hidden flex flex-col border-border/50 shadow-xl rounded-lg bg-card"
        aria-labelledby={dialogTitleId}
      >
        <DialogTitle id={dialogTitleId} className="sr-only">File Editor</DialogTitle>
        
        <DialogHeader className="relative flex items-center justify-between border-b border-border py-1 px-3 flex-shrink-0 h-[38px]">
          <div className="flex items-center space-x-1 flex-grow">
             <span className="text-sm font-medium text-foreground truncate">File Editor</span>
          </div>
          <TooltipProvider delayDuration={300}><Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-6 w-6">
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Close Editor (Esc)</p></TooltipContent>
          </Tooltip></TooltipProvider>
        </DialogHeader>

        {/* Main Toolbar */}
        <div className="flex items-center justify-between p-1.5 border-b border-border/60 bg-muted/20 flex-shrink-0 h-[42px]">
          <div className="flex items-center gap-0.5">
            {toolbarButtons.map(btn => (
              <TooltipProvider key={btn.id} delayDuration={300}> <Tooltip> <TooltipTrigger asChild>
                {btn.dropdown ? ( /* Snapshot Dropdown Logic */
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 py-1" disabled={btn.disabled}>
                        {isLoadingSnapshots ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <btn.icon className="h-4 w-4 mr-1.5" />}
                        <span className="text-xs">{btn.label}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-80 sm:w-96">
                      <DropdownMenuLabel className="text-xs">Server Snapshots ({serverSnapshots.length}/{MAX_SERVER_SNAPSHOTS})</DropdownMenuLabel>
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-0">(Oldest unlocked pruned)</DropdownMenuLabel>
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
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View</p></TooltipContent></Tooltip></TooltipProvider>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotLock(snapshot.id, !!snapshot.isLocked)}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground focus:!text-destructive-foreground" onClick={() => handleDeleteSnapshot(snapshot.id)} disabled={snapshot.isLocked}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete</p></TooltipContent></Tooltip></TooltipProvider>
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
                ) : ( /* Regular Toolbar Buttons */
                  <Button variant="ghost" size="sm" className="h-7 px-2 py-1" onClick={btn.onClick} disabled={btn.disabled || btn.isLoading}>
                    {btn.isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <btn.icon className="h-4 w-4 mr-1.5" />}
                    <span className="text-xs">{btn.label}</span>
                  </Button>
                )}
              </TooltipTrigger> <TooltipContent><p>{btn.tooltip}</p></TooltipContent> </Tooltip> </TooltipProvider>
            ))}
          </div>
          {/* Right side: Active File Info */}
          <div className="flex items-center space-x-2 text-xs text-muted-foreground shrink-0 ml-2 truncate">
            <span className="font-mono truncate max-w-[150px] sm:max-w-[200px] md:max-w-xs" title={activeFileDisplayPath}>{activeFileDisplayPath}</span>
            <span>|</span> <span className="capitalize">{activeFileLang}</span>
            <span>|</span> <span>{activeFileCharCount} chars</span>
            <span>|</span> <span>{activeFileLinesCount} lines</span>
            {activeFileUnsaved && <span className="text-orange-400 font-semibold ml-1">* Unsaved</span>}
            {activeFileReadOnly && <span className="text-red-400 font-semibold ml-1">(Read-only)</span>}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex-shrink-0 border-b border-border/60 bg-muted/20">
          <ScrollArea orientation="horizontal" className="h-auto whitespace-nowrap no-scrollbar">
            <div className="flex p-1.5 gap-1">
              {openedTabs.map((tab) => (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveTabPath(tab.path)}
                  className={cn(
                    "relative group flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-0 disabled:opacity-50 cursor-pointer min-w-[100px] max-w-[200px]",
                    activeTabPath === tab.path ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                    "pr-6" 
                  )}
                  title={tab.path}
                >
                  <span className="truncate">{tab.name}</span>
                  {tab.unsavedChanges && ( <span className="ml-1.5 text-orange-400 font-bold">*</span> )}
                  {tab.isLoading && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
                  {tab.error && <AlertTriangle className="ml-1.5 h-3 w-3 text-destructive" title={tab.error ?? undefined}/>}
                  <Button
                    variant="ghost" size="icon"
                    className={cn(
                      "absolute right-0.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm transition-opacity p-0 opacity-50 group-hover:opacity-100",
                      activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80"
                    )}
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    aria-label={`Close tab ${tab.name}`}
                  ><X className="h-3 w-3" /></Button>
                </div>
              ))}
              {openedTabs.length === 0 && ( <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open.</div> )}
            </div>
          </ScrollArea>
        </div>
        
        {/* Main Content Area (File Tree | Editor Pane) */}
        <div className="flex flex-1 overflow-hidden min-h-0"> 
            {/* File Tree Sidebar (Collapsible) */}
            {isFileTreeOpen && (
              <div className="w-52 bg-muted/30 border-r border-border/60 flex flex-col flex-shrink-0 overflow-hidden">
                <div className="p-2 border-b border-border flex items-center gap-1 flex-shrink-0">
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
                </div>
                <div className="p-1 border-b border-border flex items-center justify-around flex-shrink-0">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTimeout(() => toast({title:"New File: Not Implemented"}),0)}><FilePlus className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>New File</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTimeout(() => toast({title:"New Folder: Not Implemented"}),0)}><FolderPlus className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>New Folder</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTimeout(() => toast({title:"Upload: Not Implemented"}),0)}><Upload className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Upload</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fetchFileTreeItems(fileTreePathRef.current)} disabled={isFileTreeLoading}><RefreshCw className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Refresh Tree</TooltipContent></Tooltip></TooltipProvider>
                </div>
                <ScrollArea className="flex-grow p-1">
                  {isFileTreeLoading ? <div className="p-3 flex items-center justify-center text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading...</div>
                    : fileTreeError ? <Alert variant="destructive" className="m-2 text-xs"><FileWarning className="h-3 w-3" /><ShadcnAlertTitle className="text-xs font-semibold">Error</ShadcnAlertTitle><AlertDescription className="text-xs">{fileTreeError}</AlertDescription></Alert>
                    : <ul> {fileTreeItems.map((item) => ( <li key={item.name} className="flex justify-between items-center px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs" onClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(path.join(fileTreePathRef.current, item.name), item.name)}> <div className="flex items-center space-x-2 min-w-0"> {getFileIcon(item.name, item.type)} <span className="truncate">{item.name}</span> </div> </li> ))} {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && ( <li className="px-2 py-1 text-xs text-muted-foreground text-center">Directory is empty.</li> )} </ul>
                  }
                </ScrollArea>
              </div>
            )}

            {/* Editor Pane (Takes remaining space) */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 border-2 border-border/70 rounded-md shadow-sm m-1">
                <div className="flex items-center justify-start p-1.5 border-b border-border/60 bg-muted/40 flex-shrink-0 truncate">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFileTreeOpen(prev => !prev)}>
                            {isFileTreeOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                        </Button>
                    </TooltipTrigger><TooltipContent>{isFileTreeOpen ? "Close File Tree" : "Open File Tree"}</TooltipContent></Tooltip></TooltipProvider>
                </div>
                <div className="flex-grow relative p-0 bg-background min-h-0"> 
                  {activeTabData ? (
                    <>
                      {!activeTabData.isWritable && activeTabData.content !== null && !activeTabData.isLoading && !activeTabData.error && (
                        <Alert variant="destructive" className="m-2 text-xs p-2 absolute top-0 left-0 right-0 z-10 rounded-none border-0 border-b">
                            <FileWarning className="h-4 w-4" />
                            <ShadcnAlertTitle className="font-semibold">Read-only</ShadcnAlertTitle>
                            <AlertDescription>This file is not writable. Changes cannot be saved.</AlertDescription>
                        </Alert>
                      )}
                      {activeTabData.isLoading && !activeTabData.error ? ( <div className="absolute inset-0 flex items-center justify-center text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...</div>
                      ) : activeTabData.error ? ( <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center"> <AlertTriangle className="h-6 w-6 mb-2" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{activeTabData.error}</AlertDescription> <Button variant="outline" size="sm" className="mt-3" onClick={() => { if (activeTabPathRef.current) { const path = activeTabPathRef.current; setOpenedTabs(prev => prev.map(t => t.path === path ? {...t, content: null, originalContent: null, error: null, isLoading: false, unsavedChanges: false} : t)); setTimeout(() => setActiveTabPath(path), 0); } }}>Retry</Button> </Alert>
                      ) : (
                        <CodeEditor ref={editorRef} value={editorContentForActiveTab} language={editorLanguageForActiveTab} onChange={handleEditorContentChange} readOnly={activeTabData.isLoading || !activeTabData.isWritable || !!activeTabData.error} className="h-full w-full border-0 rounded-none" />
                      )}
                      {/* Search Widget */}
                      {isSearchWidgetOpen && activeTabData && !activeTabData.isLoading && !activeTabData.error && (
                        <div className="absolute top-1 right-1 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                           <div className="flex items-center gap-1">
                            <Input id="editor-search-input" type="text" placeholder="Find..." value={searchQuery} onChange={handleSearchInputChange} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); if (e.key === 'Escape') setIsSearchWidgetOpen(false); }} className="h-7 text-xs px-2 py-1 flex-grow"/>
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
                            {PRESET_SEARCH_TERMS.map((term) => ( <Button key={term} variant="outline" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button>))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : ( <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center"><p>No file selected. Double-click a file in the tree or open a tab.</p></div> )}
                </div>
            </div>
        </div>
        
        <DialogFooter className="p-1.5 border-t border-border/60 bg-muted/50 flex-shrink-0 text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} DVPanel
        </DialogFooter>
      </DialogContent>
      {isSnapshotViewerOpen && selectedSnapshotForViewer && (
        <SnapshotViewerDialog isOpen={isSnapshotViewerOpen} onOpenChange={setIsSnapshotViewerOpen} snapshot={selectedSnapshotForViewer} />
      )}
    </Dialog>
  );
}

