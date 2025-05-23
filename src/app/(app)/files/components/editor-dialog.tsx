
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  originalContent: string | null;
  language: string;
  isWritable: boolean | null;
  unsavedChanges: boolean;
  isLoading: boolean;
  error?: string | null;
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
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null);

  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreePathInput, setFileTreePathInput] = useState<string>('/');
  const [initialDirForReset, setInitialDirForResetInternal] = useState<string>('/');
  const fileTreePathRef = useRef<string>('/');
  const initialDirForResetRef = useRef<string>('/');

  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  
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
    activeTabPathRef.current = newActivePath;
    setActiveTabPathInternal(newActivePath);
  }, []);

  const setFileTreePath = useCallback((newPath: string) => {
    const normalizedPath = path.normalize(newPath);
    let finalPath = normalizedPath === '.' || normalizedPath === '' ? '/' : normalizedPath;
    if (finalPath !== '/' && finalPath.endsWith('/')) {
        finalPath = finalPath.slice(0, -1);
    }
    fileTreePathRef.current = finalPath;
    setFileTreePathInternal(finalPath);
    setFileTreePathInput(finalPath);
  }, []);

  const setInitialDirForReset = useCallback((newPath: string) => {
    initialDirForResetRef.current = newPath;
    setInitialDirForResetInternal(newPath);
  }, []);

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

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName?: string) => {
    const resolvedFileName = fileName || path.basename(filePath);
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab CALLED for filePath: ${filePath}, fileName: ${resolvedFileName}`);
    
    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      if (existingTabIndex !== -1) {
        const existingTab = prevTabs[existingTabIndex];
        return [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
      } else {
        const newTab: OpenedTabInfo = {
          path: filePath,
          name: resolvedFileName,
          content: null, 
          originalContent: null,
          language: getLanguageFromFilename(resolvedFileName),
          isWritable: null, 
          unsavedChanges: false,
          isLoading: false, 
          error: null,
        };
        return [...prevTabs, newTab];
      }
    });
    setActiveTabPath(filePath);
  }, [globalDebugModeActive, setActiveTabPath]);

  useEffect(() => {
    const initializeDialog = async () => {
      if (globalDebugModeActive) console.log("[EditorDialog] initializeDialog START...", { decodedFilePathToEdit });
      try {
        const settingsResult = await loadPanelSettings();
        if (settingsResult.status === 'success' && settingsResult.data) {
          setGlobalDebugModeActive(settingsResult.data.debugMode ?? false);
        } else {
          setGlobalDebugModeActive(false);
        }
      } catch (err) {
        console.error("[EditorDialog] Failed to load panel settings for debug mode", err);
        setGlobalDebugModeActive(false);
      }

      if (decodedFilePathToEdit) {
        const initialDir = path.dirname(decodedFilePathToEdit) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        setInitialDirForReset(normalizedInitialDir);
        setFileTreePath(normalizedInitialDir);
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing with filePathToEdit: ${decodedFilePathToEdit}. Initial tree path: ${normalizedInitialDir}`);
        handleOpenOrActivateTab(decodedFilePathToEdit);
      } else {
        const defaultInitialDir = (activeTabPathRef.current && openedTabs.length > 0 && path.dirname(activeTabPathRef.current)) ? (path.dirname(activeTabPathRef.current) || '/') : '/';
        const normalizedDefaultInitialDir = path.normalize(defaultInitialDir === '.' ? '/' : defaultInitialDir);
        setInitialDirForReset(normalizedDefaultInitialDir);
        setFileTreePath(normalizedDefaultInitialDir);
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
       // When dialog closes, reset opened tabs and active path
      // This ensures tabs are not persisted across dialog sessions if not desired
      // setOpenedTabs([]); 
      // setActiveTabPath(null); 
      // Consider if this reset is desired or if tabs should persist while app is open.
      // For now, I'll comment it out, assuming tabs should persist if dialog is re-opened later for the same file
    }
  }, [isOpen, decodedFilePathToEdit, globalDebugModeActive, setFileTreePath, setActiveTabPath, setInitialDirForReset, handleOpenOrActivateTab]);


  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems CALLED for path: ${pathToDisplay}`);
    setIsFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToDisplay)}`);
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems API response for ${pathToDisplay}: status=${response.status}, ok=${response.ok}`);

      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : { error: `Failed to list directory. Status: ${response.status}` }; }
        catch { errData = { error: `Failed to list directory. Status: ${response.status}. Response: ${errText.substring(0,100)}...` }; }
        throw new Error(errData.error || `Failed to list directory. Status: ${response.status}`);
      }
      const data = await response.json();
      
      if (fileTreePathRef.current === pathToDisplay) { 
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems successfully got ${data.files?.length} items for ${pathToDisplay}. Server returned path: ${data.path}`);
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        setFileTreePathInput(data.path || pathToDisplay); // Sync input with potentially normalized path from server
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Stale data for ${pathToDisplay}, current tree path is ${fileTreePathRef.current}. Discarding.`);
      }
    } catch (e: any) {
      if (fileTreePathRef.current === pathToDisplay) {
        console.error("[EditorDialog] Error fetching file tree for " + pathToDisplay + ":", e.message);
        setFileTreeError(e.message || "An error occurred fetching directory listing.");
        setFileTreeItems([]);
      } else {
         if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Error for stale path ${pathToDisplay}. Current path: ${fileTreePathRef.current}. Ignoring error display.`);
      }
    } finally {
      if (fileTreePathRef.current === pathToDisplay) {
        setIsFileTreeLoading(false);
      }
    }
  }, [isOpen, globalDebugModeActive]); // Dependencies should be stable


  useEffect(() => {
    if (isOpen && fileTreePath) {
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath, isOpen]: Triggering fetchFileTreeItems for path: ${fileTreePath}`);
        fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, fetchFileTreeItems, globalDebugModeActive]);

  useEffect(() => {
    if (fileTreeError && isOpen && fileTreePathRef.current && initialDirForResetRef.current) {
        const currentTreeP = fileTreePathRef.current;
        const initialDir = initialDirForResetRef.current;
        if (globalDebugModeActive) console.warn(`[EditorDialog] File tree error for path '${currentTreeP}', attempting to reset to '${initialDir}'. Error: ${fileTreeError}`);
        setTimeout(() => toast({ title: "Invalid Path", description: `Path "${currentTreeP}" could not be listed. ${fileTreeError}. Reverting to previous valid directory.`, variant: "destructive", duration: 4000 }), 0);
        setFileTreePath(initialDir); 
        setFileTreePathInput(initialDir);
        setFileTreeError(null);
    }
  }, [fileTreeError, isOpen, toast, globalDebugModeActive, setFileTreePath]);


  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) {
      setServerSnapshots([]); return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots CALLED for: ${filePathForSnapshots}`);
    setIsLoadingSnapshots(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`);
      if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch { errorJson = { error: `Server Error ${response.status}: ${errorText.substring(0,100)}...` }; }
          throw new Error(errorJson.error || "Failed to fetch snapshots.");
      }
      const data = await response.json();
      const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
      
      if (activeTabPathRef.current === filePathForSnapshots) {
        setServerSnapshots(snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }
    } catch (e: any) {
      if (globalDebugModeActive) console.error(`[EditorDialog] Error fetching snapshots for ${filePathForSnapshots}:`, e.message);
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
    if (!activeTabPath || !isOpen) {
      if(globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs]: Aborting - no activeTabPath (${activeTabPath}) or dialog not open (${isOpen}).`);
      return;
    }

    const activeTabIndex = openedTabs.findIndex(tab => tab.path === activeTabPath);
    if (activeTabIndex === -1) {
      if(globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs]: Aborting - activeTabPath ${activeTabPath} not found in openedTabs.`);
      return;
    }

    const activeFile = openedTabs[activeTabIndex];
    if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs]: Path: ${activeTabPath}. Tab state:`, { hasContent: activeFile.content !== null, isLoading: activeFile.isLoading, hasError: !!activeFile.error });

    if (activeFile.content === null && !activeFile.isLoading && !activeFile.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content for ${activeTabPath} is null and not loading/errored. Initiating fetch.`);
      
      setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex ? { ...t, isLoading: true, error: null } : t));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        if (globalDebugModeActive) console.warn(`[EditorDialog] Content fetch for ${activeTabPath} timed out after ${CONTENT_FETCH_TIMEOUT_MS}ms.`);
      }, CONTENT_FETCH_TIMEOUT_MS);

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(activeTabPath)}&view=true`, { signal: controller.signal })
        .then(async response => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== activeTabPath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] Discarding STALE fetched content for ${activeTabPath} as active tab changed to ${activeTabPathRef.current}.`);
             setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex && t.path === activeTabPath ? { ...t, isLoading: false } : t));
            return; 
          }
          if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try { errorJson = errorText ? JSON.parse(errorText) : {error: `HTTP error ${response.status}`}; }
            catch { errorJson = {error: `Server Error ${response.status}: ${errorText.substring(0,100)}...`};}
            throw new Error(errorJson.error || `Failed to load file. Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data && activeTabPathRef.current === activeTabPath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] Content loaded for ${activeTabPath}: writable=${data.writable}, content length=${data.content?.length}`);
            setOpenedTabs(prevTabs =>
              prevTabs.map((t, idx) =>
                idx === activeTabIndex
                  ? {
                      ...t,
                      content: data.content,
                      originalContent: data.content,
                      isWritable: data.writable,
                      isLoading: false,
                      unsavedChanges: false, 
                      error: null
                    }
                  : t
              )
            );
            fetchSnapshots(activeTabPath); 
          }
        })
        .catch(e => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== activeTabPath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] Discarding STALE error for ${activeTabPath}. Current active: ${activeTabPathRef.current}`);
            setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex && t.path === activeTabPath ? { ...t, isLoading: false } : t));
            return;
          }
          const errorMsg = e.name === 'AbortError' ? 'Request timed out while fetching file content.' : (e.message || "Failed to load content.");
          if (globalDebugModeActive) console.error(`[EditorDialog] Error fetching content for ${activeTabPath}:`, errorMsg);
          setOpenedTabs(prevTabs =>
            prevTabs.map((t, idx) =>
              idx === activeTabIndex ? { ...t, isLoading: false, error: errorMsg } : t
            )
          );
        });
    } else if (activeFile.content !== null && !activeFile.isLoading && !activeFile.error && activeTabPathRef.current === activeTabPath) {
      if ((!serverSnapshots || serverSnapshots.length === 0) && !isLoadingSnapshots && !snapshotError) {
         if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content for ${activeTabPath} exists, snapshots empty/not loading. Fetching snapshots.`);
         fetchSnapshots(activeTabPath);
      }
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, fetchSnapshots, isLoadingSnapshots, serverSnapshots, snapshotError]);


  const handleCloseDialog = useCallback(() => {
    const anyUnsaved = openedTabs.some(tab => tab.unsavedChanges);
    if (anyUnsaved) {
      if (!window.confirm("You have unsaved changes in one or more tabs. Are you sure you want to close? Changes will be lost.")) {
        return;
      }
    }
    setOpenedTabs([]); // Clear tabs when dialog is closed
    setActiveTabPath(null);
    onOpenChange(false);
  }, [openedTabs, onOpenChange, setActiveTabPath]);

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

    if (!currentActiveTab || currentActiveTab.content === null || currentActiveTab.isLoading) {
      setTimeout(() => toast({ title: "Error", description: "No active file content to snapshot or file is loading.", variant: "destructive" }), 0);
      return;
    }
    setIsCreatingSnapshot(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentActiveTab.path, content: currentActiveTab.content, language: currentActiveTab.language }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || "Failed to create snapshot.");
      
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${currentActiveTab.name} created on server.` }), 0);
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        fetchSnapshots(currentActiveTab.path); 
      }
    } catch (e: any) {
        setSnapshotError(e.message || "Error creating server snapshot");
        setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }), 0);
    } finally { setIsCreatingSnapshot(false); }
  }, [openedTabs, toast, fetchSnapshots]);

  const handleSaveChanges = useCallback(async (tabToSavePath?: string) => {
    const pathOfFileToSave = tabToSavePath || activeTabPathRef.current;
    if (!pathOfFileToSave) {
      setTimeout(() => toast({ title: "Cannot Save", description: "No active file selected.", variant: "destructive" }), 0);
      return { success: false };
    }

    const tabIndexToSave = openedTabs.findIndex(tab => tab.path === pathOfFileToSave);
    if (tabIndexToSave === -1) {
        setTimeout(() => toast({ title: "Cannot Save", description: `File "${path.basename(pathOfFileToSave)}" not found in opened tabs.`, variant: "destructive" }), 0);
        return { success: false };
    }
    const tabToSave = openedTabs[tabIndexToSave];

    if (tabToSave.content === null || tabToSave.isWritable === false || tabToSave.isLoading) {
      let reason = tabToSave.isLoading ? "is still loading" : tabToSave.isWritable === false ? "is not writable" : "has no content";
      setTimeout(() => toast({ title: "Cannot Save", description: `File "${tabToSave.name}" ${reason}.`, variant: "destructive" }), 0);
      return { success: false };
    }
    
    const shouldCreateSnapshotBeforeSave = (tabToSave.unsavedChanges || (globalDebugModeActive && tabToSave.content !== null)); 
    if (shouldCreateSnapshotBeforeSave) {
      if (globalDebugModeActive) console.log(`[EditorDialog] Auto-snapshotting ${tabToSave.name} before save.`);
      
      const originalActivePathForSnapshot = activeTabPathRef.current;
      let tempActivatedForSnapshot = false;
      if (originalActivePathForSnapshot !== tabToSave.path) {
          setActiveTabPathInternal(tabToSave.path); 
          activeTabPathRef.current = tabToSave.path; 
          await new Promise(resolve => setTimeout(resolve, 0)); 
          tempActivatedForSnapshot = true;
      }
      await handleCreateSnapshot(); // This might update serverSnapshots
      if (tempActivatedForSnapshot) {
          activeTabPathRef.current = originalActivePathForSnapshot; 
          setActiveTabPathInternal(originalActivePathForSnapshot); 
          await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    setOpenedTabs(prev => prev.map((t, idx) => idx === tabIndexToSave ? {...t, isLoading: true, error: null } : t));

    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tabToSave.path, content: tabToSave.content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save file to server.');

      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${tabToSave.name} saved.` }), 0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) =>
        idx === tabIndexToSave
          ? { ...tab, originalContent: tab.content, unsavedChanges: false, isLoading: false, error: null, isWritable: true }
          : tab
      ));
      return { success: true };
    } catch (e: any) {
        setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }), 0);
        setOpenedTabs(prevTabs => prevTabs.map((tab, idx) => idx === tabIndexToSave ? { ...tab, error: e.message, isLoading: false } : tab));
        return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, handleCreateSnapshot, toast, setActiveTabPathInternal]);

  const handleSaveAll = useCallback(async () => {
    if (globalDebugModeActive) console.log("[EditorDialog] handleSaveAll initiated.");
    setIsSavingAll(true);
    let successCount = 0; let errorCount = 0;
    
    const currentTabs = [...openedTabs]; 
    const tabsToAttemptSave = currentTabs.filter(tab => 
      (tab.unsavedChanges || (globalDebugModeActive && tab.content !== null)) && tab.isWritable !== false && !tab.isLoading
    );

    if (globalDebugModeActive) console.log(`[EditorDialog] handleSaveAll: Found ${tabsToAttemptSave.length} tabs to attempt saving.`);

    if (tabsToAttemptSave.length === 0) {
      setTimeout(() => toast({ title: "Save All", description: "No files require saving." }),0);
      setIsSavingAll(false);
      return;
    }
    
    for (const tab of tabsToAttemptSave) {
      if (globalDebugModeActive) console.log(`[EditorDialog] handleSaveAll: Attempting to save tab: ${tab.path}`);
      const result = await handleSaveChanges(tab.path);
      if (result.success) successCount++; else errorCount++;
    }
    setIsSavingAll(false);
    const message = errorCount > 0 ? `${successCount} saved. ${errorCount} failed.` : `${successCount} file(s) saved successfully.`;
    setTimeout(() => toast({ title: "Save All Complete", description: message, variant: errorCount > 0 ? "destructive" : "default" }),0);
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentActiveP = activeTabPathRef.current;
      const activeElement = document.activeElement;
      const isEditorFocused = activeElement?.closest('.cm-editor') !== null;
      const isSearchInputFocused = activeElement?.id === "editor-search-input";
      const isTreeInputFocused = activeElement?.id === "file-tree-path-input";
      
      const currentActiveTabForShortcut = openedTabs.find(tab => tab.path === currentActiveP);

      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (isOpen && currentActiveP && currentActiveTabForShortcut && currentActiveTabForShortcut.isWritable !== false && !currentActiveTabForShortcut.isLoading) {
          if(event.shiftKey) {
             handleSaveAll();
          } else {
             handleSaveChanges(); 
          }
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && isOpen && currentActiveP) {
         if (!isSearchInputFocused && !isTreeInputFocused && isEditorFocused) {
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
  }, [isOpen, openedTabs, handleSaveChanges, handleSaveAll, isSearchWidgetOpen]);


  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = serverSnapshots.find(s => s.id === snapshotId);
    const currentActiveP = activeTabPathRef.current;

    if (!snapshotToLoad || !currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "Snapshot or active file not found for loading.", variant: "destructive" }), 0);
      return;
    }

    setOpenedTabs(prevTabs => prevTabs.map(tab => {
      if (tab.path === currentActiveP) {
        return { 
          ...tab, 
          content: snapshotToLoad.content, 
          language: snapshotToLoad.language, // Make sure language is updated from snapshot
          unsavedChanges: snapshotToLoad.content !== tab.originalContent 
        };
      }
      return tab;
    }));
    setTimeout(() => toast({ title: "Snapshot Loaded", description: `Loaded snapshot from ${formatDistanceToNowStrict(new Date(snapshotToLoad.timestamp), { addSuffix: true })}.` }), 0);
  }, [serverSnapshots, toast, openedTabs]); // Removed activeTabPath as it's accessed via ref

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
      setTimeout(() => toast({ title: "Error", description: "No active file to manage snapshot locks.", variant: "destructive" }), 0);
      return;
    }
    
    // Optimistic UI update
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !isCurrentlyLocked} : s));

    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update snapshot lock status on server.");
      
      setTimeout(() => toast({ title: 'Snapshot Lock Updated', description: result.message || `Snapshot ${!isCurrentlyLocked ? 'locked' : 'unlocked'}.` }), 0);
      if(Array.isArray(result.snapshots)) { // If server returns full list, use it
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else { // Otherwise, refetch to be sure
        fetchSnapshots(currentActiveP); 
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Lock Error", description: e.message, variant: "destructive" }), 0);
      // Revert optimistic update on error
      setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: isCurrentlyLocked} : s));
      // Optionally refetch to ensure consistency if server state might have changed partially
      fetchSnapshots(currentActiveP); 
    }
  }, [toast, fetchSnapshots]); // Dependencies

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) {
        setTimeout(() => toast({ title: "Error", description: "No active file to delete snapshots from.", variant: "destructive" }), 0); return;
    }
    if (!window.confirm("Are you sure you want to delete this snapshot? This cannot be undone.")) return;

    const originalSnapshots = [...serverSnapshots];
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotId));

    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to delete snapshot from server.");
      
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message || 'Snapshot removed.' }), 0);
       if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        // fetchSnapshots(currentActiveP); // Already filtered locally, API might return new list or just success
      }
    } catch (e: any) {
      setTimeout(() => toast({ title: "Delete Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots); // Revert optimistic update
      fetchSnapshots(currentActiveP);
    }
  }, [serverSnapshots, toast, fetchSnapshots]); // Dependencies

  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); 
    
    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);
    if (tabToClose?.unsavedChanges) {
      if (!window.confirm(`"${tabToClose.name}" has unsaved changes. Are you sure you want to close it? Your changes will be lost.`)) {
        return;
      }
    }

    setOpenedTabs(prevTabs => {
      const originalIndex = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);
      
      if (activeTabPathRef.current === tabToClosePath) {
        if (updatedTabs.length > 0) {
          const newIndexToActivate = Math.max(0, Math.min(originalIndex -1, updatedTabs.length - 1)); // Try to activate tab to the left
          setActiveTabPath(updatedTabs[newIndexToActivate]?.path || null);
        } else {
          setActiveTabPath(null);
        }
      }
      return updatedTabs;
    });
  }, [openedTabs, setActiveTabPath]);

  const handleTreeFileClick = useCallback((filePath: string, fileName: string) => {
    handleOpenOrActivateTab(filePath, fileName);
  }, [handleOpenOrActivateTab]);

  const handleTreeFolderClick = useCallback((folderName: string) => {
    const currentTreeP = fileTreePathRef.current;
    const newPath = path.join(currentTreeP, folderName);
    setFileTreePath(newPath);
  }, [setFileTreePath]);
  
  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    const initialBase = initialDirForResetRef.current; // Use ref here
    if (currentTreeP === '/' || currentTreeP === initialBase) {
        if (globalDebugModeActive) console.log(`[EditorDialog] handleTreeBackClick: At root or initial base (${currentTreeP}), cannot go back further.`);
        return;
    }
    const parentDir = path.dirname(currentTreeP);
    setFileTreePath(parentDir === '.' ? '/' : parentDir);
  }, [setFileTreePath, globalDebugModeActive]); // filePathToEdit no longer needed here as initialDirForResetRef handles it

  const handleFileTreePathSubmit = useCallback(() => {
    let trimmedPath = fileTreePathInput.trim();
    if (trimmedPath === "") trimmedPath = "/";
    let normalized = path.normalize(trimmedPath);
    if (!normalized.startsWith('/')) normalized = '/' + normalized; 
    if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    
    const newTreePath = normalized || '/';
    if (newTreePath !== fileTreePathRef.current) { // Only update if path actually changes
        setFileTreePath(newTreePath);
    } else {
      setFileTreePathInput(newTreePath); // Ensure input reflects the current path even if no navigation occurs
    }
  }, [fileTreePathInput, setFileTreePath]); // fileTreePathRef not needed in deps
  
  const activeTabData = useMemo(() => {
    if (!activeTabPath) return null;
    return openedTabs.find(tab => tab.path === activeTabPath) || null;
  }, [activeTabPath, openedTabs]);
  
  const editorContentForActiveTab = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguageForActiveTab = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const hasUnsavedChangesForCurrentTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const isEditorLoadingForCurrentTab = useMemo(() => activeTabData?.isLoading ?? false, [activeTabData]);
  const editorDisplayErrorForCurrentTab = useMemo(() => activeTabData?.error, [activeTabData]);

  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);


  const performSearch = useCallback(() => {
    const view = editorRef.current?.view;
    const currentSearchQuery = searchQuery.trim();
    if (!view || !currentSearchQuery) {
      setSearchMatches([]); setCurrentMatchIndex(-1); return;
    }
    
    const cursor = new SearchCursor(
        view.state.doc, 
        currentSearchQuery, 
        0, 
        view.state.doc.length,
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
  }, [searchQuery, isCaseSensitiveSearch, toast]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (!newQuery.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, []); 

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
    setTimeout(() => performSearch(), 0); 
  }, [performSearch]);

  const toggleCaseSensitiveSearch = useCallback(() => {
    setIsCaseSensitiveSearch(prev => {
      const nextValue = !prev;
      setTimeout(() => performSearch(), 0); 
      return nextValue;
    });
  }, [performSearch]);

  useEffect(() => {
    if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[isSearchWidgetOpen] triggered. isSearchWidgetOpen: ${isSearchWidgetOpen}`);
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        setSearchMatches([]); setCurrentMatchIndex(-1);
        if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
    }
  }, [isSearchWidgetOpen, searchMatches.length, globalDebugModeActive]);


  const saveButtonDisabled = useMemo(() => {
    return isSavingAll || !activeTabData || isEditorLoadingForCurrentTab || !isCurrentFileWritable || (!hasUnsavedChangesForCurrentTab && !globalDebugModeActive) || !!editorDisplayErrorForCurrentTab;
  }, [isSavingAll, activeTabData, isEditorLoadingForCurrentTab, isCurrentFileWritable, hasUnsavedChangesForCurrentTab, globalDebugModeActive, editorDisplayErrorForCurrentTab]);

  const saveAllButtonDisabled = useMemo(() => {
    return isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive);
  }, [isSavingAll, anyUnsavedFiles, globalDebugModeActive]);
  
  const createSnapshotButtonDisabled = useMemo(() => {
     return isCreatingSnapshot || !activeTabData || !activeTabData.content || isEditorLoadingForCurrentTab || !!editorDisplayErrorForCurrentTab || (serverSnapshots.length >= MAX_SERVER_SNAPSHOTS && !(globalDebugModeActive && serverSnapshots.length < MAX_SERVER_SNAPSHOTS + 5));
  }, [isCreatingSnapshot, activeTabData, isEditorLoadingForCurrentTab, serverSnapshots, editorDisplayErrorForCurrentTab, globalDebugModeActive]);


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        ref={dialogContentRef}
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[calc(100vw-250px)] h-[calc(100vh-30px)] max-w-7xl max-h-[calc(100vh-100px)]", // Use max-w-7xl to ensure it doesn't get too wide, max-h more constrained
          "p-0 border-border/50 shadow-xl overflow-hidden bg-secondary text-foreground flex flex-col rounded-lg"
        )}
        hideCloseButton={true} 
      >
        <DialogHeader className="relative flex items-center justify-between border-b border-border py-1 px-3 flex-shrink-0">
          <div className="flex items-center space-x-1 flex-grow truncate">
            <DialogTitle className="text-sm font-semibold truncate">File Editor</DialogTitle>
          </div>
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-6 w-6">
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger><TooltipContent><p>Close Editor (Esc)</p></TooltipContent></Tooltip></TooltipProvider>
        </DialogHeader>
        
        {/* Main Toolbar */}
        <div className="flex items-center justify-between p-2 border-b border-border bg-muted/50 flex-shrink-0">
          <div className="flex items-center space-x-1">
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => handleSaveChanges()} disabled={saveButtonDisabled} isLoading={activeTabData?.isLoading && !editorDisplayErrorForCurrentTab && !isSavingAll} className="h-7 px-2 py-1">
                  <Save className="h-4 w-4 mr-1.5" /><span className="text-xs">Save</span>
              </Button>
            </TooltipTrigger><TooltipContent><p>Save (Ctrl+S)</p></TooltipContent></Tooltip></TooltipProvider>

            <TooltipProvider><Tooltip><TooltipTrigger asChild>
               <Button variant="ghost" size="sm" onClick={handleSaveAll} disabled={saveAllButtonDisabled} isLoading={isSavingAll} className="h-7 px-2 py-1">
                  <SaveAll className="h-4 w-4 mr-1.5" /><span className="text-xs">Save All</span>
               </Button>
            </TooltipTrigger><TooltipContent><p>Save All Unsaved Tabs (Ctrl+Shift+S)</p></TooltipContent></Tooltip></TooltipProvider>

            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => setIsSearchWidgetOpen(prev => !prev)} disabled={!activeTabData || !!editorDisplayErrorForCurrentTab} className="h-7 px-2 py-1">
                  <SearchIconLucide className="h-4 w-4 mr-1.5" /><span className="text-xs">Find</span>
              </Button>
            </TooltipTrigger><TooltipContent><p>Find in Current File (Ctrl+F)</p></TooltipContent></Tooltip></TooltipProvider>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={!activeTabData || !!editorDisplayErrorForCurrentTab || isLoadingSnapshots} className="h-7 px-2 py-1">
                      <Camera className="h-4 w-4 mr-1.5" /><span className="text-xs">Snapshots</span>
                  </Button>
              </TooltipTrigger><TooltipContent><p>File Snapshots (Server-Side)</p></TooltipContent></Tooltip></TooltipProvider>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 sm:w-96">
                  <DropdownMenuLabel className="text-xs">Server Snapshots (Active Tab)</DropdownMenuLabel>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-0">(Max {MAX_SERVER_SNAPSHOTS} server-side, oldest unlocked are pruned)</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isLoadingSnapshots ? (
                  <DropdownMenuItem disabled className="text-xs"><Loader2 className="mr-2 h-3 w-3 animate-spin" />Loading snapshots...</DropdownMenuItem>
                  ) : snapshotError ? (
                  <DropdownMenuItem disabled className="text-xs text-destructive"><AlertTriangle className="mr-2 h-3 w-3" />{snapshotError}</DropdownMenuItem>
                  ) : serverSnapshots.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs text-center py-2">No server snapshots for this file.</DropdownMenuItem>
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
                          <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedSnapshotForViewer(snapshot); setIsSnapshotViewerOpen(true);}}><Eye className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>View Snapshot</p></TooltipContent></Tooltip></TooltipProvider>
                          <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSnapshotLock(snapshot.id, !!snapshot.isLocked)}>{snapshot.isLocked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}</Button></TooltipTrigger><TooltipContent><p>{snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot (Prevent Auto-Pruning)"}</p></TooltipContent></Tooltip></TooltipProvider>
                          <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive-foreground" onClick={() => handleDeleteSnapshot(snapshot.id)} disabled={snapshot.isLocked}><Trash2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent><p>Delete Snapshot</p></TooltipContent></Tooltip></TooltipProvider>
                          </div>
                      </DropdownMenuItem>
                      ))}
                  </ScrollArea>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { setTimeout(() => handleCreateSnapshot(), 0); }} disabled={createSnapshotButtonDisabled} className="text-xs">
                  {isCreatingSnapshot ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <Camera className="mr-2 h-3 w-3" />} Create Snapshot on Server
                  </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex-shrink-0 border-b border-border bg-muted/30">
          <ScrollArea orientation="horizontal" className="h-auto whitespace-nowrap no-scrollbar">
            <div className="flex p-1.5 gap-1">
              {openedTabs.map((tab) => (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveTabPath(tab.path)}
                  className={cn(
                    "relative group flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 cursor-pointer",
                    activeTabPath === tab.path ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                    "pr-7" 
                  )}
                  title={tab.path}
                >
                  <span className="truncate max-w-[150px]">{tab.name}</span>
                  {tab.unsavedChanges && <span className="ml-1.5 text-orange-400">*</span>}
                  {tab.isLoading && !tab.error && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
                  {tab.error && <AlertTriangle className="ml-1.5 h-3 w-3 text-destructive" title={tab.error}/>}
                  <Button
                    variant="ghost" size="icon"
                    className={cn(
                      "absolute right-0.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-sm transition-opacity", 
                       activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80",
                       "opacity-50 group-hover:opacity-100" // Show on group hover
                    )}
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    aria-label={`Close tab ${tab.name}`}
                  ><FileX2 className="h-3 w-3" /></Button> 
                </div>
              ))}
              {openedTabs.length === 0 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open. Double-click a file in the main file manager or in the tree below.</div>
              )}
            </div>
          </ScrollArea>
        </div>
        
        {/* Active File Info Header - Now Below Tab Bar */}
        {activeTabData && (
          <div className="flex items-center justify-between text-xs text-muted-foreground p-2 border-b border-border bg-muted/40 flex-shrink-0 truncate">
            <span className="truncate" title={activeTabData.path}>{activeTabData.path}</span>
            <div className="flex items-center space-x-2 shrink-0 ml-2">
                <span className="capitalize">{activeTabData.language}</span>
                <span>|</span>
                <span>{editorContentForActiveTab.length} chars</span>
                <span>|</span>
                <span>{editorContentForActiveTab.split('\n').length} lines</span>
                {hasUnsavedChangesForCurrentTab && <span className="text-orange-400 font-semibold ml-1">* Unsaved</span>}
                {!isCurrentFileWritable && activeTabData.isWritable !== null && <span className="text-red-400 font-semibold ml-1">(Read-only)</span>}
            </div>
          </div>
        )}


        {/* Main Content Area: File Tree | Editor Pane */}
        <div className="flex flex-grow overflow-hidden min-h-0">
          {/* File Tree Sidebar */}
          <div className="w-64 border-r border-border bg-muted/30 flex-shrink-0 flex flex-col min-h-0">
            <div className="p-2 border-b border-border flex items-center gap-1 flex-shrink-0">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={!useMemo(() => {
                    if (!filePathToEdit && !initialDirForResetRef.current) return fileTreePath === '/'; // Fallback if no initial context
                    const base = initialDirForResetRef.current || path.dirname(filePathToEdit || '/');
                    const normalizedBase = path.normalize(base === '.' ? '/' : base);
                    return fileTreePath === '/' || fileTreePath === normalizedBase;
                }, [fileTreePath, filePathToEdit, initialDirForResetRef.current]) || isFileTreeLoading} className="h-7 w-7">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent><p>Up One Level</p></TooltipContent></Tooltip></TooltipProvider>
              <Input
                id="file-tree-path-input"
                className="h-7 text-xs px-2 py-1 flex-grow font-mono"
                value={fileTreePathInput}
                onChange={(e) => setFileTreePathInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFileTreePathSubmit(); } }}
                placeholder="Path..."
                disabled={isFileTreeLoading}
              />
            </div>
            <ScrollArea className="flex-grow p-1">
              {isFileTreeLoading ? (
                <div className="p-3 flex items-center justify-center text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading tree...</div>
              ) : fileTreeError ? (
                <Alert variant="destructive" className="m-2 text-xs"><FileWarning className="h-3 w-3" /><ShadcnAlertTitle className="text-xs font-semibold">Tree Error</ShadcnAlertTitle><AlertDescription className="text-xs">{fileTreeError}</AlertDescription></Alert>
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
          <div className="flex-1 flex flex-col min-h-0 min-w-0 border-2 border-border/70 rounded-md shadow-sm">
             {activeTabData ? (
                <div className="flex-grow relative p-0 bg-background min-h-0">
                    {isEditorLoadingForCurrentTab ? ( 
                    <div className="absolute inset-0 flex items-center justify-center text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...</div>
                    ) : editorDisplayErrorForCurrentTab ? ( 
                    <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-6 w-6 mb-2" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{editorDisplayErrorForCurrentTab}</AlertDescription>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                            if (activeTabPath) { // Retry logic for specific tab
                                setOpenedTabs(prev => prev.map(t => t.path === activeTabPath ? {...t, content: null, originalContent: null, error: null, isLoading: false} : t));
                                // Trigger content fetch effect by ensuring content is null and isLoading is false
                                setTimeout(() => setActiveTabPath(activeTabPath), 0); 
                            }
                        }}>Retry</Button>
                    </Alert>
                    ) : (
                    <CodeEditor
                        ref={editorRef}
                        value={editorContentForActiveTab} 
                        language={editorLanguageForActiveTab} 
                        onChange={handleEditorContentChange}
                        readOnly={isEditorLoadingForCurrentTab || !isCurrentFileWritable || !!editorDisplayErrorForCurrentTab} 
                        className="h-full w-full border-0 rounded-none"
                    />
                    )}
                    {isSearchWidgetOpen && activeTabData && !isEditorLoadingForCurrentTab && !editorDisplayErrorForCurrentTab && (
                    <div className="absolute top-2 right-2 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                        <div className="flex items-center gap-1">
                        <Input
                            id="editor-search-input" type="text" placeholder="Find..." value={searchQuery}
                            onChange={handleSearchInputChange} onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                            className="h-7 text-xs px-2 py-1 flex-grow"
                        />
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={toggleCaseSensitiveSearch} className={cn("h-6 w-6", isCaseSensitiveSearch && "bg-accent text-accent-foreground")}><CaseSensitive className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Case Sensitive</TooltipContent></Tooltip></TooltipProvider>
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setIsSearchWidgetOpen(false)} className="h-6 w-6"><X className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Close Search</TooltipContent></Tooltip></TooltipProvider>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                        <div className="flex gap-0.5">
                            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6"><ChevronUp className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Previous Match</TooltipContent></Tooltip></TooltipProvider>
                            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6"><ChevronDown className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Next Match</TooltipContent></Tooltip></TooltipProvider>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                            {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : "No matches"}
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
                  <p>{(isOpen && decodedFilePathToEdit && openedTabs.length === 0 && !activeTabData) ? "Error: Initial file path invalid or could not be opened as a tab." : "Select a file from the tree or open a tab to start editing."}</p>
                </div>
            )}
          </div>
        </div>

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

    