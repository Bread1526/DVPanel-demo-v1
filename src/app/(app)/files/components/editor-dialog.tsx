
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'; // Ensure DialogClose is imported if needed
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
  Replace as ReplaceIcon,
  Sparkles as SparklesIcon,
  Palette as PaletteIcon,
  Settings2 as EditorSettingsIcon,
  HelpCircle as HelpCircleIcon,
  Camera,
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
const CONTENT_FETCH_TIMEOUT_MS = 20000;

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
  const dialogTitleId = React.useId();

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
    const tab = openedTabs.find(tab => tab.path === activeTabPathRef.current) || null;
    if (globalDebugModeActive) console.log('[EditorDialog] useMemo[activeTabData] derived. Active Path:', activeTabPathRef.current, 'Found Tab:', tab);
    return tab;
  }, [openedTabs, activeTabPath, globalDebugModeActive]); // activeTabPath is state

  const editorContentForActiveTab = useMemo(() => {
    const content = activeTabData?.content ?? "";
    if (globalDebugModeActive) console.log('[EditorDialog] useMemo[editorContentForActiveTab] derived. Length:', content.length);
    return content;
  }, [activeTabData, globalDebugModeActive]);

  const editorLanguageForActiveTab = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
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
        setIsFileTreeLoading(false); // Still clear loading for the stale path
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
        setFileTreePathInput(data.path || pathToDisplay);
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
  }, [isOpen, globalDebugModeActive]);


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
          isLoading: false, // Will be set to true by the useEffect that fetches content
          error: null,
          unsavedChanges: false,
        }];
        if (globalDebugModeActive) console.log(`[EditorDialog] Tab ${filePath} is new, adding.`);
      }
      return newTabsList;
    });
    setActiveTabPath(filePath); // This triggers the useEffect for content loading
  }, [setActiveTabPath, globalDebugModeActive]);

  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Initializing effect triggered. isOpen:", isOpen, "filePathToEdit:", filePathToEdit);
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
        setFileTreePath(normalizedInitialDir);
        handleOpenOrActivateTab(filePathToEdit);
      } else {
        const defaultInitialDir = (activeTabPathRef.current && path.dirname(activeTabPathRef.current)) || '/';
        const normalizedDefaultDir = path.normalize(defaultInitialDir === '.' ? '/' : defaultInitialDir);
        initialDirForResetRef.current = normalizedDefaultDir;
        setFileTreePath(normalizedDefaultDir);
        if (openedTabs.length > 0 && !activeTabPathRef.current) {
          setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
           setActiveTabPath(null);
        }
      }
      setIsSearchWidgetOpen(false); setSearchQuery(""); setSearchMatches([]); setCurrentMatchIndex(-1);
    }
  }, [isOpen, filePathToEdit, handleOpenOrActivateTab, setFileTreePath, setActiveTabPath, globalDebugModeActive]);


  useEffect(() => {
    if (isOpen && fileTreePath) {
       if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen] - Path changed to: ${fileTreePath}. Triggering fetch.`);
      fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);

  useEffect(() => {
    const currentActivePath = activeTabPathRef.current;
    if (!currentActivePath || !isOpen) return;

    const activeTabIndex = openedTabs.findIndex(tab => tab.path === currentActivePath);
    if (activeTabIndex === -1) return;

    const tabToLoad = openedTabs[activeTabIndex];

    if (tabToLoad.content === null && !tabToLoad.isLoading && !tabToLoad.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs, isOpen]: Tab ${currentActivePath} needs content. Starting fetch.`);
      
      setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex ? { ...t, isLoading: true, error: null } : t));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        if (globalDebugModeActive) console.log(`[EditorDialog] Content fetch for ${currentActivePath} TIMEOUT after ${CONTENT_FETCH_TIMEOUT_MS}ms.`);
      }, CONTENT_FETCH_TIMEOUT_MS);

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActivePath)}&view=true`, { signal: controller.signal })
        .then(async response => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== currentActivePath && isOpen) {
             if (globalDebugModeActive) console.log(`[EditorDialog] Content fetch for ${currentActivePath} STALE (active is ${activeTabPathRef.current}). Aborting UI update.`);
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
          if (data && isOpen && activeTabPathRef.current === currentActivePath) {
            if (globalDebugModeActive) console.log(`[EditorDialog] Content fetch for ${currentActivePath} SUCCESS. Data:`, data);
            setOpenedTabs(prevTabs => prevTabs.map((t, idx) =>
              idx === activeTabIndex
              ? { ...t, content: data.content, originalContent: data.content, isWritable: data.writable, isLoading: false, error: null, unsavedChanges: false }
              : t
            ));
            // Fetch snapshots after content is successfully loaded for the active tab
            fetchSnapshots(currentActivePath);
          }
        })
        .catch((e: any) => {
          clearTimeout(timeoutId);
          if (isOpen && activeTabPathRef.current === currentActivePath) {
            const errorMsg = e.name === 'AbortError' ? 'Timeout fetching content.' : (e.message || "Failed to load content.");
            if (globalDebugModeActive) console.error(`[EditorDialog] Content fetch for ${currentActivePath} ERROR:`, errorMsg);
            setOpenedTabs(prevTabs => prevTabs.map((t, idx) =>
              idx === activeTabIndex ? { ...t, isLoading: false, error: errorMsg, content: "" } : t
            ));
          }
        });
    } else if (tabToLoad.content !== null && !tabToLoad.isLoading && !tabToLoad.error && activeTabPathRef.current === tabToLoad.path) {
      // Content is loaded for the active tab, ensure snapshots are fetched if not already loaded
      // Avoid fetching snapshots if they've been loaded or if there was an error
      if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError) {
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs, isOpen]: Content loaded for ${currentActivePath}. Triggering snapshot fetch.`);
        fetchSnapshots(currentActivePath);
      }
    }
  }, [activeTabPath, openedTabs, isOpen, fetchSnapshots, globalDebugModeActive]); // Using activeTabPath (state) as direct dependency

  useEffect(() => {
    if (fileTreeError && isOpen) {
      const currentTreeP = fileTreePathRef.current;
      const initialDir = initialDirForResetRef.current;
      if (currentTreeP !== initialDir) {
        setTimeout(() => toast({ title: "Invalid Path", description: `Path "${currentTreeP}" not found or inaccessible. Reverting to "${initialDir}".`, variant: "destructive", duration: 4000 }), 0);
        setFileTreePath(initialDir);
      } else {
        setTimeout(() => toast({ title: "Directory Error", description: `Error on initial path "${currentTreeP}": ${fileTreeError}.`, variant: "destructive", duration: 4000 }), 0);
      }
      setFileTreeError(null);
    }
  }, [fileTreeError, isOpen, toast, setFileTreePath]);

  const handleCloseDialog = useCallback(() => {
    if (anyUnsavedFiles) {
      if (!window.confirm("You have unsaved changes in one or more files. Are you sure you want to close the editor? Your changes will be lost.")) {
        return;
      }
    }
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

  const handleSaveChanges = useCallback(async (tabToSavePath?: string) => {
    const pathOfFileToSave = tabToSavePath || activeTabPathRef.current;
    if (!pathOfFileToSave) {
      setTimeout(() => toast({ title: "Cannot Save", description: "No active file.", variant: "destructive" }), 0);
      return { success: false };
    }

    const tabIndexToSave = openedTabs.findIndex(tab => tab.path === pathOfFileToSave);
    if (tabIndexToSave === -1) {
      setTimeout(() => toast({ title: "Cannot Save", description: `File not found in tabs.`, variant: "destructive" }), 0);
      return { success: false };
    }

    let tabData = openedTabs[tabIndexToSave];
    if (tabData.content === null || tabData.isWritable === false || tabData.isLoading) {
      setTimeout(() => toast({ title: "Cannot Save", description: `File ${tabData.name} is ${tabData.isLoading ? "loading" : "not writable/no content"}.`, variant: "destructive" }), 0);
      return { success: false };
    }
    
    const shouldCreateSnapshot = (tabData.unsavedChanges || globalDebugModeActive);
    if (shouldCreateSnapshot && activeTabPathRef.current === pathOfFileToSave) {
        await handleCreateSnapshot();
    }

    setOpenedTabs(prev => prev.map((t, idx) => idx === tabIndexToSave ? {...t, isLoading: true, error: null } : t));
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tabData.path, content: tabData.content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Save failed.');
      
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${tabData.name} saved.` }), 0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) =>
        idx === tabIndexToSave
        ? { ...tab, originalContent: tab.content, unsavedChanges: false, isLoading: false, error: null, isWritable: true }
        : tab
      ));
      return { success: true };
    } catch (e: any) {
      setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }), 0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) =>
        idx === tabIndexToSave ? { ...tab, error: e.message, isLoading: false } : tab
      ));
      return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, toast, /* handleCreateSnapshot will be memoized */]);

  const handleSaveAll = useCallback(async () => {
    setIsSavingAll(true);
    let successCount = 0; let errorCount = 0;
    const tabsToAttemptSave = openedTabs.filter(tab =>
        (tab.unsavedChanges || globalDebugModeActive) &&
        tab.isWritable !== false && !tab.isLoading && tab.content !== null
    );

    if (tabsToAttemptSave.length === 0) {
      setTimeout(() => toast({ title: "Save All", description: "No files require saving." }), 0);
      setIsSavingAll(false); return;
    }

    for (const tab of tabsToAttemptSave) {
      const result = await handleSaveChanges(tab.path);
      if (result.success) successCount++; else errorCount++;
    }
    setIsSavingAll(false);
    const message = errorCount > 0 ? `${successCount} saved. ${errorCount} failed.` : `${successCount} file(s) saved.`;
    setTimeout(() => toast({ title: "Save All Complete", description: message, variant: errorCount > 0 ? "destructive" : "default" }), 0);
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);

  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);

    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`"${tabToClose.name}" has unsaved changes. Close anyway?`)) return;
    }

    setOpenedTabs(prevTabs => {
      const originalIndex = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);

      if (activeTabPathRef.current === tabToClosePath) {
        if (updatedTabs.length > 0) {
          const newIndexToActivate = Math.max(0, Math.min(originalIndex, updatedTabs.length - 1));
          setActiveTabPath(updatedTabs[newIndexToActivate]?.path || null);
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
    if (trimmedPath === "") trimmedPath = "/";
    let normalized = path.normalize(trimmedPath);
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    const newTreePath = normalized || '/';

    if (newTreePath !== fileTreePathRef.current) {
      setFileTreePath(newTreePath);
    } else {
      setFileTreePathInput(newTreePath);
    }
  }, [fileTreePathInput, setFileTreePath]);

  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    const initialBase = initialDirForResetRef.current;

    if (currentTreeP === '/' || currentTreeP === '.') return;
    
    const parentDir = path.dirname(currentTreeP);
    if (initialBase !== '/' && !parentDir.startsWith(initialBase) && parentDir !== initialBase.slice(0,-1) && parentDir !== initialBase) {
      setFileTreePath(initialBase);
      return;
    }
    setFileTreePath(parentDir === '.' || parentDir === '' ? '/' : parentDir);
  }, [setFileTreePath, globalDebugModeActive]);

  const handleCreateSnapshot = useCallback(async () => {
    const currentFileInEditorP = activeTabPathRef.current;
    const activeTabForSnapshot = openedTabs.find(t => t.path === currentFileInEditorP);
    if (!activeTabForSnapshot || activeTabForSnapshot.content === null || activeTabForSnapshot.isLoading) {
      setTimeout(() => toast({ title: "Error", description: "No active content or file loading to snapshot.", variant: "destructive" }), 0);
      return;
    }
    setIsCreatingSnapshot(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentFileInEditorP, content: activeTabForSnapshot.content, language: activeTabForSnapshot.language })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || "Server snapshot creation failed.");
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${activeTabForSnapshot.name} created.` }), 0);
      if (currentFileInEditorP) fetchSnapshots(currentFileInEditorP);
    } catch (e: any) {
      setSnapshotError(e.message);
      setTimeout(() => toast({ title: "Snapshot Creation Error", description: e.message, variant: "destructive" }), 0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [openedTabs, toast, fetchSnapshots, globalDebugModeActive]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = serverSnapshots.find(s => s.id === snapshotId);
    const currentActiveP = activeTabPathRef.current;
    if (!snapshotToLoad || !currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "Snapshot/active file not found.", variant: "destructive" }), 0); return;
    }
    setOpenedTabs(prevTabs => prevTabs.map(tab =>
      tab.path === currentActiveP
      ? { ...tab, content: snapshotToLoad.content, originalContent: snapshotToLoad.content, language: snapshotToLoad.language, unsavedChanges: false, error: null }
      : tab
    ));
    setTimeout(() => toast({ title: "Snapshot Loaded", description: `Loaded snapshot for ${path.basename(currentActiveP)}.` }), 0);
  }, [serverSnapshots, toast, openedTabs]);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !isCurrentlyLocked} : s)); // Optimistic
    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update lock on server.");
      setTimeout(() => toast({ title: 'Lock Updated', description: result.message || `Snapshot ${!isCurrentlyLocked ? 'locked' : 'unlocked'}.` }), 0);
      if (currentActiveP) fetchSnapshots(currentActiveP);
    } catch (e: any) {
      setTimeout(() => toast({ title: "Lock Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: isCurrentlyLocked} : s)); // Revert
      if (currentActiveP) fetchSnapshots(currentActiveP);
    }
  }, [toast, fetchSnapshots]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    if (!window.confirm("Are you sure you want to delete this snapshot permanently?")) return;
    
    const originalSnapshots = [...serverSnapshots];
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotId)); // Optimistic
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to delete snapshot on server.");
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message || 'Snapshot removed.' }), 0);
      if (Array.isArray(result.snapshots)) {
         setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Snapshot Delete Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots);
    }
  }, [serverSnapshots, toast]);

  const performSearch = useCallback((queryToSearch?: string, caseSensitiveOverride?: boolean) => {
    const view = editorRef.current?.view;
    const currentSearchQuery = (queryToSearch !== undefined ? queryToSearch : searchQuery).trim();
    const currentCaseSensitive = caseSensitiveOverride !== undefined ? caseSensitiveOverride : isCaseSensitiveSearch;

    if (!view || !currentSearchQuery) {
      setSearchMatches([]); setCurrentMatchIndex(-1); return;
    }
    
    const cursor = new SearchCursor(view.state.doc, currentSearchQuery, 0, view.state.doc.length, currentCaseSensitive ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase());
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
      setTimeout(() => toast({ title: "Not Found", description: `"${currentSearchQuery}" was not found.`, duration: 2000 }), 0);
    }
  }, [searchQuery, isCaseSensitiveSearch, toast]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (!newQuery.trim()) {
      setSearchMatches([]); setCurrentMatchIndex(-1);
    } else {
      performSearch(newQuery, isCaseSensitiveSearch);
    }
  }, [performSearch, isCaseSensitiveSearch]);

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
    const newCaseSensitiveState = !isCaseSensitiveSearch;
    setIsCaseSensitiveSearch(newCaseSensitiveState);
    performSearch(searchQuery, newCaseSensitiveState);
  }, [performSearch, searchQuery, isCaseSensitiveSearch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activeTabData && isCurrentFileWritable && !activeTabData.isLoading && !isSavingAll) {
          if (event.shiftKey) handleSaveAll();
          else handleSaveChanges();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && activeTabData) {
         if (!isInputFocused || activeElement?.closest('.cm-editor')) {
          event.preventDefault();
          if (!isSearchWidgetOpen) setIsSearchWidgetOpen(true);
          setTimeout(() => document.getElementById("editor-search-input")?.focus(), 0);
          const searchInputEl = document.getElementById("editor-search-input") as HTMLInputElement | null;
          if (searchInputEl) searchInputEl.select();
        }
      }
      if (event.key === 'Escape') {
        if (isSearchWidgetOpen) { event.preventDefault(); event.stopPropagation(); setIsSearchWidgetOpen(false); }
        else if (isSnapshotViewerOpen) { /* Let SnapshotViewerDialog handle its close */ }
        else if (isOpen) { event.preventDefault(); handleCloseDialog(); }
      }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTabData, isCurrentFileWritable, handleSaveChanges, handleSaveAll, isSearchWidgetOpen, isSnapshotViewerOpen, handleCloseDialog]);

  useEffect(() => {
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
      setSearchMatches([]); setCurrentMatchIndex(-1);
      if (editorRef.current?.view) {
        const currentSelection = editorRef.current.view.state.selection.main;
        if (currentSelection.from !== currentSelection.to) {
          editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
      }
    }
  }, [isSearchWidgetOpen, searchMatches.length]);

  const normalizedInitialBaseDir = useMemo(() => {
    if (!filePathToEdit) return '/';
    const initialBaseDir = path.dirname(filePathToEdit);
    return path.normalize(initialBaseDir === '.' ? '/' : initialBaseDir);
  }, [filePathToEdit]);

  const treeBackButtonDisabled = useMemo(() => {
    if (isFileTreeLoading) return true;
    const normalizedCurrentTree = path.normalize(fileTreePathRef.current || '/');
    
    // If filePathToEdit is null (meaning no initial file context), allow going up to root.
    if (!filePathToEdit) return normalizedCurrentTree === '/';

    // If filePathToEdit exists, restrict going above its initial directory.
    const baseForComparison = initialDirForResetRef.current || normalizedInitialBaseDir;
    if (normalizedCurrentTree === baseForComparison) return true;
    
    // Check if parent is below base or is the base itself
    const parentDir = path.dirname(normalizedCurrentTree);
    if (baseForComparison !== '/' && !parentDir.startsWith(baseForComparison) && parentDir !== baseForComparison.slice(0,-1)) {
       return true; // Prevent going "above" initial context if not root
    }
    return normalizedCurrentTree === '/'; // Default: disable if at absolute root
  }, [isFileTreeLoading, fileTreePath, filePathToEdit, normalizedInitialBaseDir]);

  const saveButtonDisabled = useMemo(() => isSavingAll || !activeTabData || activeTabData.isLoading || !activeTabData.isWritable || (!activeTabData.unsavedChanges && !globalDebugModeActive) || !!activeTabData.error, [isSavingAll, activeTabData, globalDebugModeActive]);
  const saveAllButtonDisabled = useMemo(() => isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive), [isSavingAll, anyUnsavedFiles, globalDebugModeActive]);
  const createSnapshotButtonDisabled = useMemo(() => {
    const maxSnapshots = globalDebugModeActive ? MAX_SERVER_SNAPSHOTS + 5 : MAX_SERVER_SNAPSHOTS;
    return isCreatingSnapshot || !activeTabData || !activeTabData.content || activeTabData.isLoading || !!activeTabData.error || serverSnapshots.length >= maxSnapshots;
  }, [isCreatingSnapshot, activeTabData, serverSnapshots, globalDebugModeActive]);


  const toolbarButtons = [
    { id: 'save', label: 'Save', icon: Save, onClick: () => handleSaveChanges(), disabled: saveButtonDisabled, isLoading: activeTabData?.isLoading && !isSavingAll && activeTabData?.path === activeTabPathRef.current && !activeTabData.error, tooltip: "Save (Ctrl+S)" },
    { id: 'saveAll', label: 'Save All', icon: SaveAll, onClick: handleSaveAll, disabled: saveAllButtonDisabled, isLoading: isSavingAll, tooltip: "Save All Unsaved Tabs (Ctrl+Shift+S)" },
    { id: 'find', label: 'Find', icon: SearchIconLucide, onClick: () => { setIsSearchWidgetOpen(prev => !prev); if (!isSearchWidgetOpen) { setTimeout(() => document.getElementById("editor-search-input")?.focus(),0); } }, disabled: !activeTabData || !!activeTabData.error, tooltip: "Find in Current File (Ctrl+F)" },
    { id: 'snapshots', label: 'Snapshots', icon: Camera, dropdown: true, disabled: !activeTabData || !!activeTabData.error || isLoadingSnapshots, tooltip: "File Snapshots (Server-Side)" },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, onClick: () => { if(activeTabPathRef.current) { const path = activeTabPathRef.current; setOpenedTabs(p => p.map(t=> t.path === path ? {...t, content: null, originalContent: null, error: null, isLoading: false, unsavedChanges: false} : t)); setActiveTabPath(path); } else { setTimeout(()=>toast({title:"Refresh: No active file"}),0);} }, tooltip: "Reload File from Disk", disabled: !activeTabData || activeTabData.isLoading },
    { id: 'replace', label: 'Replace', icon: ReplaceIcon, onClick: () => setTimeout(()=>toast({title:"Replace: Not Implemented"}),0), tooltip: "Replace in File", disabled: true },
    { id: 'jumpline', label: 'Jump', icon: SparklesIcon, onClick: () => setTimeout(()=>toast({title:"Jump to Line: Not Implemented"}),0), tooltip: "Jump to Line", disabled: true },
    { id: 'font', label: 'Font', icon: PaletteIcon, onClick: () => setTimeout(()=>toast({title:"Font Settings: Not Implemented"}),0), tooltip: "Font Settings", disabled: true },
    { id: 'theme', label: 'Theme', icon: EditorSettingsIcon, onClick: () => setTimeout(()=>toast({title:"Editor Theme: Not Implemented"}),0), tooltip: "Change Editor Theme", disabled: true },
    { id: 'help', label: 'Help', icon: HelpCircleIcon, onClick: () => setTimeout(()=>toast({title:"Editor Help: Not Implemented"}),0), tooltip: "Help", disabled: true },
  ];

  const activeFileDisplayPath = useMemo(() => activeTabData?.path || "No file selected", [activeTabData]);
  const activeFileLang = useMemo(() => activeTabData?.language ? activeTabData.language.charAt(0).toUpperCase() + activeTabData.language.slice(1) : "N/A", [activeTabData]);
  const activeFileCharCount = useMemo(() => activeTabData?.content?.length ?? 0, [activeTabData]);
  const activeFileLinesCount = useMemo(() => activeTabData?.content?.split('\n').length ?? 0, [activeTabData]);
  const activeFileUnsaved = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const activeFileReadOnly = useMemo(() => activeTabData?.isWritable === false, [activeTabData]);


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        aria-labelledby={dialogTitleId}
        className="fixed inset-0 bg-background p-[60px] flex flex-col overflow-hidden"
        hideCloseButton={true}
      >
        <div className="border-4 border-border/60 rounded-lg shadow-xl bg-card flex flex-col flex-1 overflow-hidden">
          <DialogHeader className="relative flex items-center justify-between border-b border-border py-1 px-3 flex-shrink-0 h-[38px]">
            <DialogTitle id={dialogTitleId} className="text-sm font-medium truncate">File Editor</DialogTitle>
            <TooltipProvider delayDuration={300}><Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-6 w-6">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Close Editor (Esc)</p></TooltipContent>
            </Tooltip></TooltipProvider>
          </DialogHeader>

          <div className="flex items-center justify-between p-1.5 border-b border-border/60 bg-muted/20 flex-shrink-0 h-[42px]">
            <div className="flex items-center gap-0.5">
              {toolbarButtons.map(btn => (
                <TooltipProvider key={btn.id} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {btn.dropdown ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 py-1" disabled={btn.disabled}>
                              {btn.isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <btn.icon className="h-4 w-4 mr-1.5" />}
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
                                      <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedSnapshotForViewer(snapshot); setIsSnapshotViewerOpen(true);}}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View</p></TooltipContent></Tooltip></TooltipProvider>
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
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={btn.onClick} disabled={btn.disabled || btn.isLoading}>
                          {btn.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <btn.icon className="h-4 w-4" />}
                        </Button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent><p>{btn.tooltip}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground shrink-0 ml-2 truncate">
              <span className="font-mono truncate max-w-[200px] sm:max-w-xs md:max-w-sm" title={activeFileDisplayPath}>{activeFileDisplayPath}</span>
              <span>|</span> <span className="capitalize">{activeFileLang}</span>
              <span>|</span> <span>{activeFileCharCount} chars</span>
              <span>|</span> <span>{activeFileLinesCount} lines</span>
              {activeFileUnsaved && <span className="text-orange-400 font-semibold ml-1">* Unsaved</span>}
              {activeFileReadOnly && <span className="text-red-400 font-semibold ml-1">(Read-only)</span>}
            </div>
          </div>

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
                      {tab.unsavedChanges && (
                        <span className="ml-1.5 text-orange-400 font-bold">*</span>
                      )}
                       {tab.isLoading && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
                       {tab.error && <AlertTriangle className="ml-1.5 h-3 w-3 text-destructive" title={tab.error ?? undefined}/>}
                       <Button
                        variant="ghost" size="icon"
                        className={cn(
                          "absolute right-0.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-sm transition-opacity p-0",
                          activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80",
                          "opacity-50 group-hover:opacity-100"
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
          
          <div className="flex flex-col flex-1 overflow-hidden min-h-0"> {/* This div manages the File Tree and Editor Pane */}
            <div className="flex flex-1 overflow-hidden min-h-0"> {/* This div allows horizontal arrangement and overflow handling */}
                {isFileTreeOpen && (
                  <div className="w-52 bg-muted/30 border-r border-border/60 flex flex-col flex-shrink-0 overflow-hidden">
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
                    </div>
                    <ScrollArea className="flex-grow p-1">
                      {isFileTreeLoading ? <div className="p-3 flex items-center justify-center text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading...</div>
                        : fileTreeError ? <Alert variant="destructive" className="m-2 text-xs"><FileWarning className="h-3 w-3" /><ShadcnAlertTitle className="text-xs font-semibold">Error</ShadcnAlertTitle><AlertDescription className="text-xs">{fileTreeError}</AlertDescription></Alert>
                        : <ul> {fileTreeItems.map((item) => ( <li key={item.name} className="px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs" onClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(path.join(fileTreePathRef.current, item.name), item.name)}> <div className="flex items-center space-x-2"> {getFileIcon(item.name, item.type)} <span className="truncate">{item.name}</span> </div> </li> ))} {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && ( <li className="px-2 py-1 text-xs text-muted-foreground text-center">Directory is empty.</li> )} </ul>
                      }
                    </ScrollArea>
                    <div className="p-1.5 border-t border-border/60 flex items-center justify-around flex-shrink-0">
                      <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTimeout(() => toast({title:"New File: Not Implemented"}),0)}><FilePlus className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>New File</TooltipContent></Tooltip></TooltipProvider>
                      <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTimeout(() => toast({title:"New Folder: Not Implemented"}),0)}><FolderPlus className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>New Folder</TooltipContent></Tooltip></TooltipProvider>
                      <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTimeout(() => toast({title:"Upload: Not Implemented"}),0)}><Upload className="h-4 w-4"/></Button></TooltipTrigger><TooltipContent>Upload</TooltipContent></Tooltip></TooltipProvider>
                    </div>
                  </div>
                )}
                <div className="flex-1 flex flex-col min-h-0 min-w-0 border-2 border-border/70 rounded-md shadow-sm m-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground p-1.5 border-b border-border/60 bg-muted/40 flex-shrink-0 truncate">
                        <div className="flex items-center gap-1">
                            <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFileTreeOpen(prev => !prev)}>
                                    {isFileTreeOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                                </Button>
                            </TooltipTrigger><TooltipContent>{isFileTreeOpen ? "Close File Tree" : "Open File Tree"}</TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    </div>
                    <div className="flex-grow relative p-0 bg-background min-h-0">
                      {activeTabData ? (
                        <>
                          {activeTabData.isLoading ? ( <div className="absolute inset-0 flex items-center justify-center text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...</div>
                          ) : activeTabData.error ? ( <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center"> <AlertTriangle className="h-6 w-6 mb-2" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{activeTabData.error}</AlertDescription> <Button variant="outline" size="sm" className="mt-3" onClick={() => { if (activeTabPathRef.current) { const path = activeTabPathRef.current; setOpenedTabs(prev => prev.map(t => t.path === path ? {...t, content: null, originalContent: null, error: null, isLoading: false, unsavedChanges: false} : t)); setTimeout(() => setActiveTabPath(path), 0); } }}>Retry</Button> </Alert>
                          ) : (
                            <CodeEditor ref={editorRef} value={editorContentForActiveTab} language={editorLanguageForActiveTab} onChange={handleEditorContentChange} readOnly={activeTabData.isLoading || !activeTabData.isWritable || !!activeTabData.error} className="h-full w-full border-0 rounded-none" />
                          )}
                          {isSearchWidgetOpen && activeTabData && !activeTabData.isLoading && !activeTabData.error && (
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
          </div>
          
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

    