
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

interface OpenedTabInfo {
  path: string;
  name: string;
  content: string | null;
  originalContent: string | null;
  language: string;
  isWritable: boolean | null;
  unsavedChanges: boolean;
  isLoading: boolean;
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

  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null);

  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreePathInput, setFileTreePathInput] = useState<string>('/');
  const [initialDirForReset, setInitialDirForReset] = useState<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const fileTreePathRef = useRef<string>('/');

  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);

  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  const [isSavingAll, setIsSavingAll] = useState(false);


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
    setFileTreePathInput(finalPath);
  }, [globalDebugModeActive]);

  const decodedFilePathToEdit = useMemo(() => {
    if (!filePathToEdit) return null;
    try {
      return decodeURIComponent(filePathToEdit);
    } catch (e) {
      console.error("[EditorDialog] Error decoding filePathToEdit:", filePathToEdit, e);
      setTimeout(() => toast({ title: "Error", description: "Invalid file path provided.", variant: "destructive" }), 0);
      return null;
    }
  }, [filePathToEdit, toast]);

  useEffect(() => {
    const initializeDialog = async () => {
      if (globalDebugModeActive) console.log("[EditorDialog] Initializing Dialog...", { filePathToEdit, decodedFilePathToEdit });
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
        setFileTreePath(initialDir);
        setInitialDirForReset(initialDir);
        handleOpenOrActivateTab(decodedFilePathToEdit, path.basename(decodedFilePathToEdit));
      } else {
        const defaultTreePath = openedTabs.length > 0 && activeTabPath ? (path.dirname(activeTabPath) || '/') : '/';
        setFileTreePath(defaultTreePath);
        setInitialDirForReset(defaultTreePath);
        if (openedTabs.length > 0 && !activeTabPath && !activeTabPathRef.current) {
          setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
          setActiveTabPath(null);
        }
      }
      setIsSearchWidgetOpen(false); setSearchQuery(""); setSearchMatches([]); setCurrentMatchIndex(-1);
    };

    if (isOpen) {
      initializeDialog();
    } else {
      if (globalDebugModeActive) console.log("[EditorDialog] Dialog closing, non-persistent states reset.");
      setFileTreeError(null);
      setSnapshotError(null);
    }
  }, [isOpen, decodedFilePathToEdit, globalDebugModeActive]);

  useEffect(() => { activeTabPathRef.current = activeTabPath; }, [activeTabPath]);
  useEffect(() => { fileTreePathRef.current = fileTreePath; }, [fileTreePath]);

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
      if (fileTreePathRef.current === pathToDisplay) {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems API response for ${pathToDisplay}:`, data.files?.length);
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        if (data.path && path.normalize(data.path) !== path.normalize(pathToDisplay)) {
          if(globalDebugModeActive) console.log(`[EditorDialog] File tree path updated by server from ${pathToDisplay} to ${data.path}`);
          setFileTreePathInternal(data.path);
          fileTreePathRef.current = data.path;
          setFileTreePathInput(data.path);
        }
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Stale data for ${pathToDisplay}, current tree path is ${fileTreePathRef.current}. Discarding.`);
      }
    } catch (e: any) {
      if (fileTreePathRef.current === pathToDisplay) {
        console.error("[EditorDialog] Error fetching file tree:", e);
        setFileTreeError(e.message || "An error occurred fetching directory listing.");
        setFileTreeItems([]);
      } else {
         if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Error for stale path ${pathToDisplay}. Ignoring error display for this specific fetch.`);
      }
    } finally {
      if (fileTreePathRef.current === pathToDisplay) {
        setIsFileTreeLoading(false);
      }
    }
  }, [isOpen, globalDebugModeActive, setFileTreePath]);

  useEffect(() => {
    if (isOpen && fileTreePath) {
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen]: Triggering fetchFileTreeItems for ${fileTreePath}`);
        fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);

  useEffect(() => {
    if (fileTreeError && fileTreePathInput !== fileTreePathRef.current && isOpen) {
        if (globalDebugModeActive) console.warn(`[EditorDialog] File tree error for path '${fileTreePathRef.current}', attempting to reset to '${initialDirForReset}' as input was '${fileTreePathInput}'`);
        toast({ title: "Invalid Path", description: `Path "${fileTreePathRef.current}" could not be listed. ${fileTreeError}`, variant: "destructive" });
        setFileTreePath(initialDirForReset);
        setFileTreeError(null);
    }
  }, [fileTreeError, fileTreePathInput, initialDirForReset, isOpen, toast, globalDebugModeActive, setFileTreePath]);


  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Aborting, no file path or dialog closed for ${filePathForSnapshots}.`);
      setServerSnapshots([]);
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

      if (activeTabPathRef.current === filePathForSnapshots) {
        setServerSnapshots(snapshots);
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Discarding snapshots for ${filePathForSnapshots} as active tab is now ${activeTabPathRef.current}`);
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

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab CALLED for filePath: ${filePath}, fileName: ${fileName}`);

    const existingTabIndex = openedTabs.findIndex(tab => tab.path === filePath);
    if (existingTabIndex !== -1) {
      const existingTab = openedTabs[existingTabIndex];
      const newTabs = [...openedTabs.slice(0, existingTabIndex), ...openedTabs.slice(existingTabIndex + 1), existingTab];
      setOpenedTabs(newTabs);
    } else {
      const newTab: OpenedTabInfo = {
        path: filePath, name: fileName,
        content: null, originalContent: null,
        language: getLanguageFromFilename(fileName),
        isWritable: null, unsavedChanges: false,
        isLoading: true,
        error: null,
      };
      setOpenedTabs(prevTabs => [...prevTabs, newTab]);
    }
    setActiveTabPath(filePath);
  }, [globalDebugModeActive, openedTabs, setActiveTabPath]);

  useEffect(() => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP || !isOpen) return;

    const tabIndex = openedTabs.findIndex(tab => tab.path === currentActiveP);
    if (tabIndex === -1) return;

    const currentActiveTab = openedTabs[tabIndex];

    if (currentActiveTab.content === null && currentActiveTab.isLoading && !currentActiveTab.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath - ContentLoad]: Fetching content for ${currentActiveP}`);

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActiveP)}&view=true`)
        .then(async response => {
            if (!response.ok) {
                let errorJson = { error: `Failed to load file. Status: ${response.status}` };
                try { errorJson = await response.json(); } catch { /* ignore */ }
                throw new Error(errorJson.error || `Failed to load file. Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
          if (activeTabPathRef.current === currentActiveP) {
            if (globalDebugModeActive) console.log(`[EditorDialog] Content Loaded for ${currentActiveP}: writable=${data.writable}`);
            setOpenedTabs(prevTabs => prevTabs.map(t =>
              t.path === currentActiveP ? {
                ...t, content: data.content, originalContent: data.content,
                isWritable: data.writable, isLoading: false, unsavedChanges: false, error: null
              } : t
            ));
            fetchSnapshots(currentActiveP);
          }
        })
        .catch((e: any) => {
          console.error(`[EditorDialog] Error fetching content for ${currentActiveP}:`, e.message);
          if (activeTabPathRef.current === currentActiveP) {
            setOpenedTabs(prevTabs => prevTabs.map(t =>
              t.path === currentActiveP ? { ...t, isLoading: false, error: e.message || "Failed to load content." } : t
            ));
            setTimeout(() => toast({ title: "Error Loading File", description: e.message || "Failed to load file content.", variant: "destructive" }),0);
          }
        });
    } else if (currentActiveTab.content !== null && !currentActiveTab.isLoading) {
        if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError && !currentActiveTab.error) {
             fetchSnapshots(currentActiveP);
        }
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, fetchSnapshots, toast, serverSnapshots.length, isLoadingSnapshots, snapshotError]);

  const handleCloseDialog = useCallback(() => {
    const anyUnsaved = openedTabs.some(tab => tab.unsavedChanges);
    if (anyUnsaved) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to close the editor? Your changes will be lost.")) return;
    }
    onOpenChange(false);
  }, [openedTabs, onOpenChange]);

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
  }, []);

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
        throw new Error(result.error || result.details || `Server error ${response.status} creating snapshot.`);
      }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${currentActiveTab.name} created.` }), 0);

      if (Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveTab.path);
      }
    } catch (e: any) {
        if (globalDebugModeActive) console.error("[EditorDialog] Error creating snapshot:", e.message);
        setSnapshotError(e.message || "Error creating snapshot");
        setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }), 0);
    } finally { setIsCreatingSnapshot(false); }
  }, [openedTabs, globalDebugModeActive, toast, fetchSnapshots]);


  const handleSaveChanges = useCallback(async (tabToSavePath?: string) => {
    const pathOfFileToSave = tabToSavePath || activeTabPathRef.current;
    const tabIndexToSave = openedTabs.findIndex(tab => tab.path === pathOfFileToSave);

    if (tabIndexToSave === -1) {
        setTimeout(() => toast({ title: "Cannot Save", description: "No active file specified.", variant: "destructive" }), 0);
        return { success: false };
    }
    const tabToSave = openedTabs[tabIndexToSave];

    if (tabToSave.content === null || tabToSave.isWritable === false) {
        setTimeout(() => toast({ title: "Cannot Save", description: `File "${tabToSave.name}" is not writable or has no content.`, variant: "destructive" }), 0);
        return { success: false };
    }

    const shouldCreateSnapshotBeforeSave = tabToSave.unsavedChanges || globalDebugModeActive;

    setOpenedTabs(prev => prev.map((t, idx) => idx === tabIndexToSave ? {...t, isLoading: true, error: null } : t));

    try {
      if (shouldCreateSnapshotBeforeSave && (tabToSave.unsavedChanges || globalDebugModeActive)) {
        await handleCreateSnapshot();
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


  const handleSaveAll = useCallback(async () => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleSaveAll CALLED");
    setIsSavingAll(true);
    let successCount = 0;
    let errorCount = 0;
    const unsavedTabs = openedTabs.filter(tab => tab.unsavedChanges && tab.isWritable !== false && tab.content !== null);

    if (unsavedTabs.length === 0 && !globalDebugModeActive) {
        toast({ title: "Save All", description: "No unsaved changes to save." });
        setIsSavingAll(false);
        return;
    }
    
    // In debug mode, save all writable tabs even if no unsaved changes
    const tabsToProcess = globalDebugModeActive ? openedTabs.filter(tab => tab.isWritable !== false && tab.content !== null) : unsavedTabs;


    for (const tab of tabsToProcess) {
        const result = await handleSaveChanges(tab.path);
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
         toast({ title: "Save All", description: "No changes detected in writable files (Debug Mode).", variant: "default" });
    }
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);


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
        if (isOpen && currentActiveP && currentActiveTabForShortcut && currentActiveTabForShortcut.isWritable !== false) {
          if(event.shiftKey) {
            handleSaveAll();
          } else {
            handleSaveChanges();
          }
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && isOpen && currentActiveP) {
        if (isEditorWidgetFocused && !isSearchWidgetOpen && editorRef.current?.view) {
           // openSearchPanel(editorRef.current.view); // Standard CodeMirror search
        } else if (!isEditorWidgetFocused && !isSearchInputFocused && !isTreeInputFocused) {
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

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openedTabs, handleSaveChanges, handleSaveAll, globalDebugModeActive, isSearchWidgetOpen]);

  const handleViewSnapshotInPopup = useCallback((snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  }, []);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "No active file to lock snapshot.", variant: "destructive" }), 0);
      return;
    }

    const originalSnapshots = [...serverSnapshots];
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
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveP);
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Snapshot Lock Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots); // Revert optimistic update
    }
  }, [serverSnapshots, fetchSnapshots, toast, activeTabPathRef]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
        setTimeout(() => toast({ title: "Error", description: "No active file to delete snapshot from.", variant: "destructive" }), 0);
        return;
    }
    if (!window.confirm("Are you sure you want to delete this snapshot? This action cannot be undone.")) return;

    const originalSnapshots = [...serverSnapshots];
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
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveP);
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Snapshot Delete Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots); // Revert optimistic update
    }
  }, [serverSnapshots, fetchSnapshots, toast, activeTabPathRef]);

  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (globalDebugModeActive) console.log(`[EditorDialog] handleCloseTab initiated for: ${tabToClosePath}`);

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
          const newIndexToActivate = Math.max(0, Math.min(originalIndex -1 , updatedTabs.length - 1));
          const newActivePath = updatedTabs[newIndexToActivate]?.path || null;
          setTimeout(() => setActiveTabPath(newActivePath), 0);
        } else {
          setTimeout(() => setActiveTabPath(null), 0);
        }
      }
      return updatedTabs;
    });
  }, [openedTabs, globalDebugModeActive, setActiveTabPath]);

  const handleTreeFileClick = useCallback((filePath: string, fileName: string) => {
    handleOpenOrActivateTab(filePath, fileName);
  }, [handleOpenOrActivateTab]);

  const handleTreeFolderClick = useCallback((folderPath: string) => {
    setFileTreePath(folderPath);
  }, [setFileTreePath]);

  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    if (currentTreeP === '/') return;
    const parentDir = path.dirname(currentTreeP);
    setFileTreePath(parentDir);
  }, [setFileTreePath]);

  const handleFileTreePathSubmit = useCallback(() => {
    const trimmedPath = fileTreePathInput.trim();
    let normalized = path.normalize(trimmedPath === '' ? '/' : trimmedPath);
    if (normalized !== '/' && !normalized.startsWith('/')) { normalized = '/' + normalized; }
    if (normalized !== '/' && normalized.endsWith('/')) { normalized = normalized.slice(0, -1); }
    setFileTreePath(normalized || '/');
  }, [fileTreePathInput, setFileTreePath]);

  const activeTabData = useMemo(() => {
    if (!activeTabPath) return null;
    return openedTabs.find(tab => tab.path === activeTabPath) || null;
  }, [activeTabPath, openedTabs]);

  const editorContent = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguage = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const isEditorLoading = useMemo(() => activeTabData?.isLoading ?? false, [activeTabData]);
  const isEditorSaving = useMemo(() => openedTabs.some(tab => tab.isLoading && tab.path === activeTabPathRef.current && !tab.unsavedChanges && !tab.error), [openedTabs]);
  const hasUnsavedChangesForCurrentTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);

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
        isCaseSensitiveSearch ? undefined : (str: string) => str.toLowerCase()
    );
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
      setTimeout(() => toast({ title: "Not Found", description: `"${searchQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, toast, editorRef]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (newQuery.trim() === "") {
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
         if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
    } else {
        setTimeout(() => performSearch(), 0); // Live search
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
  }, [searchMatches, editorRef]);

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
    setTimeout(() => performSearch(), 0);
  }, [performSearch]);

  const toggleCaseSensitiveSearch = useCallback(() => {
    setIsCaseSensitiveSearch(prev => {
      setTimeout(() => performSearch(),0);
      return !prev;
    });
  }, [performSearch]);

  useEffect(() => {
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
        if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
    }
  }, [isSearchWidgetOpen, searchMatches.length, editorRef]);

  const editorDisplayError = activeTabData?.error;
  const saveButtonDisabled = isEditorSaving || !isCurrentFileWritable || (!hasUnsavedChangesForCurrentTab && !globalDebugModeActive);
  const saveAllButtonDisabled = isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive);


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[calc(100vw-125px)] h-[calc(100vh-30px)] max-w-7xl max-h-[calc(100vh-60px)]", // Adjusted for slightly more padding
          "p-0 border-border/50 shadow-xl overflow-hidden bg-secondary text-foreground flex flex-col rounded-lg"
        )}
        hideCloseButton={true}
      >
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
                </TooltipTrigger><TooltipContent><p>Find (Ctrl+F)</p></TooltipContent></Tooltip></TooltipProvider>
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
                                <div className="flex flex-col items-start cursor-pointer flex-grow mr-1" onClick={() => handleViewSnapshotInPopup(snapshot)}>
                                <span className={cn(snapshot.isLocked && "font-semibold")}>
                                    {formatDistanceToNowStrict(new Date(snapshot.timestamp), { addSuffix: true })}
                                    {snapshot.isLocked && <Lock className="inline h-3 w-3 ml-1 text-amber-500" />}
                                </span>
                                <span className="text-muted-foreground text-[0.65rem]">{format(new Date(snapshot.timestamp), 'MMM dd, yyyy h:mm a')}</span>
                                </div>
                                <div className="flex items-center shrink-0">
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleViewSnapshotInPopup(snapshot)}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View</p></TooltipContent></Tooltip></TooltipProvider>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotLock(snapshot.id, !!snapshot.isLocked)}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock" : "Lock"}</p></TooltipContent></Tooltip></TooltipProvider>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground" onClick={() => handleDeleteSnapshot(snapshot.id)} disabled={snapshot.isLocked}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete (Locked snapshots cannot be deleted)</p></TooltipContent></Tooltip></TooltipProvider>
                                </div>
                            </DropdownMenuItem>
                            ))}
                        </ScrollArea>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => { setTimeout(() => handleCreateSnapshot(), 0); }}
                          disabled={isCreatingSnapshot || (!globalDebugModeActive && !hasUnsavedChangesForCurrentTab && !activeTabData?.content)}
                          className="text-xs"
                        >
                        {isCreatingSnapshot ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <Camera className="mr-2 h-3 w-3" />}
                        Create Snapshot
                        </DropdownMenuItem>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground pt-1">Snapshots expire unless locked.</DropdownMenuLabel>
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
                      "pr-6"
                  )}
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
                    onClick={(e) => handleCloseTab(tab.path, e)}
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

        {/* Active File Info Header - Below Tabs */}
        {activeTabData && (
            <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-border bg-muted/40 text-xs text-muted-foreground">
                 <span className="truncate max-w-[150px] sm:max-w-xs md:max-w-sm lg:max-w-lg xl:max-w-xl" title={activeTabData.path}>{activeTabData.path}</span>
                 <div className="flex items-center space-x-2">
                    <span>{editorLanguage}</span>
                    <span>|</span>
                    <span>{activeTabData.content?.length ?? 0} chars</span>
                    <span>|</span>
                    <span>{activeTabData.content?.split('\n').length ?? 0} lines</span>
                    {activeTabData.unsavedChanges && <span className="text-orange-400 font-semibold ml-2">* Unsaved</span>}
                 </div>
            </div>
        )}

        {/* Main Content Area (File Tree + Editor Pane) */}
        <div className="flex flex-grow overflow-hidden min-h-0">
          {/* File Tree Sidebar */}
          <div className="w-72 border-r border-border bg-muted/30 flex-shrink-0 flex flex-col min-h-0">
            <div className="p-2 border-b border-border flex items-center gap-1 flex-shrink-0">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={fileTreePathRef.current === '/'} className="h-7 w-7">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent><p>Go Up</p></TooltipContent></Tooltip></TooltipProvider>
              <Input
                id="file-tree-path-input"
                className="h-7 text-xs px-2 py-1 flex-grow font-mono"
                value={fileTreePathInput}
                onChange={(e) => setFileTreePathInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFileTreePathSubmit(); } }}
                placeholder="Enter path..."
              />
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

          {/* Editor Pane */}
          <div className={cn("flex-1 flex flex-col min-h-0 min-w-0 border-l border-border shadow-sm", !activeTabData && "items-center justify-center", "border-2 border-border/70 rounded-md")}>
             {activeTabData ? (
                <div className="flex-grow relative p-0 bg-background min-h-0">
                    {isEditorLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...
                    </div>
                    ) : editorDisplayError ? (
                    <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-6 w-6 mb-2" />
                        <ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle>
                        <AlertDescription>{editorDisplayError}</AlertDescription>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => {
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
                        className="h-full w-full border-0 rounded-none"
                    />
                    )}
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
            ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
                <p>{decodedFilePathToEdit && !activeTabData ? "Error opening file or file path is invalid." : "Select a file from the tree or open a tab to start editing."}</p>
                </div>
            )}
          </div>
        </div>

        {/* Copyright Footer */}
        <DialogFooter className="p-2 border-t border-border bg-muted/50 flex-shrink-0 text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} DVPanel
        </DialogFooter>

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


    