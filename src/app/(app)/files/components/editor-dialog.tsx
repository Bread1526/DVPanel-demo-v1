
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
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
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true); 
  
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

  const activeTabData = useMemo(() => {
    if (!activeTabPathRef.current) return null;
    return openedTabs.find(tab => tab.path === activeTabPathRef.current) || null;
  }, [activeTabPathRef.current, openedTabs]);

  const editorContentForActiveTab = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguageForActiveTab = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const hasUnsavedChangesForCurrentTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const isEditorLoadingForCurrentTab = useMemo(() => activeTabData?.isLoading ?? false, [activeTabData]);
  const editorDisplayErrorForCurrentTab = useMemo(() => activeTabData?.error, [activeTabData]);
  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);

  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) return;
    setIsFileTreeLoading(true); setFileTreeError(null);
    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToDisplay)}`);
      if (fileTreePathRef.current !== pathToDisplay) { setIsFileTreeLoading(false); return; }
      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : { error: `List failed. Status: ${response.status}` }; }
        catch { errData = { error: `List failed. Status: ${response.status}. Response: ${errText.substring(0,100)}...` }; }
        throw new Error(errData.error || `List failed. Status: ${response.status}`);
      }
      const data = await response.json();
      if (fileTreePathRef.current === pathToDisplay) {
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        if ((data.path || pathToDisplay) !== fileTreePathInput) setFileTreePathInput(data.path || pathToDisplay);
      }
    } catch (e: any) {
      if (fileTreePathRef.current === pathToDisplay) {
        setFileTreeError(e.message || "Error fetching tree."); setFileTreeItems([]);
      }
    } finally {
      if (fileTreePathRef.current === pathToDisplay) setIsFileTreeLoading(false);
    }
  }, [isOpen, fileTreePathInput]);

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName?: string) => {
    const resolvedFileName = fileName || path.basename(filePath);
    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      if (existingTabIndex !== -1) {
        const existingTab = prevTabs[existingTabIndex];
        return [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
      } else {
        return [...prevTabs, {
          path: filePath, name: resolvedFileName, content: null, originalContent: null,
          language: getLanguageFromFilename(resolvedFileName), isWritable: null,
          unsavedChanges: false, isLoading: false, error: null,
        }];
      }
    });
    setActiveTabPath(filePath);
  }, [setActiveTabPath]);

  const fetchSnapshots = useCallback(async (filePathForSnapshots: string | null) => {
    if (!filePathForSnapshots || !isOpen) { setServerSnapshots([]); return; }
    setIsLoadingSnapshots(true); setSnapshotError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`, {signal: controller.signal});
      clearTimeout(timeoutId);
      if (activeTabPathRef.current !== filePathForSnapshots) return;
      if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch { errorJson = { error: `Snapshots load error. Status: ${response.status}` }; }
          throw new Error(errorJson.error || "Failed to fetch snapshots.");
      }
      const data = await response.json();
      if (activeTabPathRef.current === filePathForSnapshots) {
        setServerSnapshots(Array.isArray(data.snapshots) ? data.snapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : []);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (activeTabPathRef.current !== filePathForSnapshots) return;
      const errorMsg = e.name === 'AbortError' ? 'Timeout fetching snapshots.' : (e.message || "Error fetching snapshots");
      setSnapshotError(errorMsg);
      setTimeout(() => toast({ title: "Snapshot Load Error", description: errorMsg, variant: "destructive" }), 0);
    } finally {
      if (activeTabPathRef.current === filePathForSnapshots) setIsLoadingSnapshots(false);
    }
  }, [isOpen, toast]);

  useEffect(() => {
    const initializeDialog = async () => {
      const settingsResult = await loadPanelSettings();
      setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);

      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        setInitialDirForReset(normalizedInitialDir);
        setFileTreePath(normalizedInitialDir); 
        handleOpenOrActivateTab(filePathToEdit); 
      } else {
        const defaultInitialDir = (activeTabPathRef.current && path.dirname(activeTabPathRef.current)) || '/';
        const normalizedDefaultDir = path.normalize(defaultInitialDir === '.' ? '/' : defaultInitialDir);
        setInitialDirForReset(normalizedDefaultDir);
        setFileTreePath(normalizedDefaultDir);
        if (openedTabs.length > 0 && !activeTabPathRef.current) {
          setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
          setActiveTabPath(null);
        }
      }
      setIsSearchWidgetOpen(false); setSearchQuery(""); setSearchMatches([]); setCurrentMatchIndex(-1);
    };
    if (isOpen) initializeDialog();
  }, [isOpen, filePathToEdit]);

  useEffect(() => {
    if (isOpen && fileTreePath) fetchFileTreeItems(fileTreePath);
  }, [fileTreePath, isOpen, fetchFileTreeItems]);

  useEffect(() => {
    if (!activeTabPath || !isOpen) return;
    const activeTabIndex = openedTabs.findIndex(tab => tab.path === activeTabPath);
    if (activeTabIndex === -1) return;
    const activeFile = openedTabs[activeTabIndex];

    if (activeFile.content === null && !activeFile.isLoading && !activeFile.error) {
      setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex ? { ...t, isLoading: true, error: null } : t));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);
      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(activeTabPath)}&view=true`, { signal: controller.signal })
        .then(async response => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== activeTabPath) return;
          if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try { errorJson = errorText ? JSON.parse(errorText) : {error: `HTTP error ${response.status}`}; }
            catch { errorJson = {error: `Server Error ${response.status}: ${errorText.substring(0,100)}...`};}
            throw new Error(errorJson.error || `Load failed. Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data && activeTabPathRef.current === activeTabPath) { 
            setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex ? { ...t, content: data.content, originalContent: data.content, isWritable: data.writable, isLoading: false, error: null } : t ));
            fetchSnapshots(activeTabPath);
          }
        })
        .catch((e: any) => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== activeTabPath) return;
          const errorMsg = e.name === 'AbortError' ? 'Timeout fetching content.' : (e.message || "Failed to load content.");
          setOpenedTabs(prevTabs => prevTabs.map((t, idx) => idx === activeTabIndex ? { ...t, isLoading: false, error: errorMsg } : t ));
        });
    } else if (activeFile.content !== null && !activeFile.isLoading && !activeFile.error) {
       if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError) {
         fetchSnapshots(activeTabPath);
      }
    }
  }, [activeTabPath, openedTabs, isOpen, fetchSnapshots, isLoadingSnapshots, snapshotError, serverSnapshots]);

  const handleCloseDialog = useCallback(() => {
    if (anyUnsavedFiles) if (!window.confirm("Unsaved changes. Close anyway?")) return;
    onOpenChange(false);
  }, [anyUnsavedFiles, onOpenChange]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === currentActiveP ? { ...tab, content: newContent, unsavedChanges: (tab.originalContent !== null ? newContent !== tab.originalContent : newContent !== "") } : tab
    ));
  }, []);

  const currentFileInEditorPath = activeTabData?.path;

  const handleCreateSnapshot = useCallback(async () => {
    if (!currentFileInEditorPath || !activeTabData || activeTabData.content === null || activeTabData.isLoading) {
      setTimeout(() => toast({ title: "Error", description: "No active content or file loading.", variant: "destructive" }), 0); return;
    }
    setIsCreatingSnapshot(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: currentFileInEditorPath, content: activeTabData.content, language: activeTabData.language }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || "Snapshot creation failed.");
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot created.` }), 0);
      if (Array.isArray(result.snapshots)) setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      else fetchSnapshots(currentFileInEditorPath);
    } catch (e: any) {
      setSnapshotError(e.message); setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive" }), 0);
    } finally { setIsCreatingSnapshot(false); }
  }, [currentFileInEditorPath, activeTabData, toast, fetchSnapshots]);

  const handleSaveChanges = useCallback(async (tabToSavePath?: string) => {
    const pathOfFileToSave = tabToSavePath || activeTabPathRef.current;
    if (!pathOfFileToSave) { setTimeout(() => toast({ title: "Cannot Save", description: "No active file.", variant: "destructive" }), 0); return { success: false }; }
    const tabIndexToSave = openedTabs.findIndex(tab => tab.path === pathOfFileToSave);
    if (tabIndexToSave === -1) { setTimeout(() => toast({ title: "Cannot Save", description: "File not found.", variant: "destructive" }), 0); return { success: false }; }
    const tabToSave = openedTabs[tabIndexToSave];

    if (tabToSave.content === null || tabToSave.isWritable === false || tabToSave.isLoading) {
      setTimeout(() => toast({ title: "Cannot Save", description: `File ${tabToSave.name} is ${tabToSave.isLoading ? "loading" : "not writable or no content"}.`, variant: "destructive" }), 0);
      return { success: false };
    }
    
    const shouldCreateSnapshot = (tabToSave.unsavedChanges || (globalDebugModeActive && tabToSave.content !== null));
    if (shouldCreateSnapshot && activeTabPathRef.current === tabToSave.path && currentFileInEditorPath) {
      await handleCreateSnapshot();
    }
    
    setOpenedTabs(prev => prev.map((t, idx) => idx === tabIndexToSave ? {...t, isLoading: true, error: null } : t));
    try {
      const response = await fetch(`/api/panel-daemon/file`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: tabToSave.path, content: tabToSave.content }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${tabToSave.name} saved.` }), 0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) => idx === tabIndexToSave ? { ...tab, originalContent: tab.content, unsavedChanges: false, isLoading: false, error: null, isWritable: true } : tab ));
      return { success: true };
    } catch (e: any) {
      setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }), 0);
      setOpenedTabs(prevTabs => prevTabs.map((tab, idx) => idx === tabIndexToSave ? { ...tab, error: e.message, isLoading: false } : tab));
      return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, handleCreateSnapshot, toast, currentFileInEditorPath]);

  const handleSaveAll = useCallback(async () => {
    setIsSavingAll(true);
    let successCount = 0; let errorCount = 0;
    const tabsToAttemptSave = openedTabs.filter(tab => (tab.unsavedChanges || (globalDebugModeActive && tab.content !== null)) && tab.isWritable !== false && !tab.isLoading );
    if (tabsToAttemptSave.length === 0) {
      setTimeout(() => toast({ title: "Save All", description: "No files require saving." }),0);
      setIsSavingAll(false); return;
    }
    for (const tab of tabsToAttemptSave) {
      const result = await handleSaveChanges(tab.path);
      if (result.success) successCount++; else errorCount++;
    }
    setIsSavingAll(false);
    const message = errorCount > 0 ? `${successCount} saved. ${errorCount} failed.` : `${successCount} file(s) saved.`;
    setTimeout(() => toast({ title: "Save All Complete", description: message, variant: errorCount > 0 ? "destructive" : "default" }),0);
  }, [openedTabs, handleSaveChanges, toast, globalDebugModeActive]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = serverSnapshots.find(s => s.id === snapshotId);
    const currentActiveP = activeTabPathRef.current;
    if (!snapshotToLoad || !currentActiveP) { setTimeout(() => toast({ title: "Error", description: "Snapshot or active file not found.", variant: "destructive" }), 0); return; }
    setOpenedTabs(prevTabs => prevTabs.map(tab => tab.path === currentActiveP ? { ...tab, content: snapshotToLoad.content, language: snapshotToLoad.language, unsavedChanges: snapshotToLoad.content !== tab.originalContent } : tab ));
    setTimeout(() => toast({ title: "Snapshot Loaded", description: `Loaded snapshot from ${formatDistanceToNowStrict(new Date(snapshotToLoad.timestamp), { addSuffix: true })}.` }), 0);
  }, [serverSnapshots, toast, openedTabs]);

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) { setTimeout(() => toast({ title: "Error", description: "No active file selected.", variant: "destructive" }), 0); return; }
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !isCurrentlyLocked} : s));
    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update lock status.");
      setTimeout(() => toast({ title: 'Snapshot Lock Updated', description: result.message || `Snapshot ${!isCurrentlyLocked ? 'locked' : 'unlocked'}.` }), 0);
      if (Array.isArray(result.snapshots)) setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      else fetchSnapshots(currentActiveP);
    } catch (e: any) {
      setTimeout(() => toast({ title: "Lock Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: isCurrentlyLocked} : s));
      fetchSnapshots(currentActiveP);
    }
  }, [toast, fetchSnapshots]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) { setTimeout(() => toast({ title: "Error", description: "No active file selected.", variant: "destructive" }), 0); return; }
    if (!window.confirm("Delete this snapshot? This cannot be undone.")) return;
    const originalSnapshots = [...serverSnapshots];
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotId));
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to delete snapshot.");
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message || 'Snapshot removed.' }), 0);
       if (Array.isArray(result.snapshots)) setServerSnapshots(result.snapshots.sort((a:Snapshot,b:Snapshot) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e: any) {
      setTimeout(() => toast({ title: "Delete Error", description: e.message, variant: "destructive" }), 0);
      setServerSnapshots(originalSnapshots);
    }
  }, [serverSnapshots, toast, fetchSnapshots]);

  const handleCloseTab = useCallback((tabToClosePath: string, event?: React.MouseEvent) => {
    event?.stopPropagation(); 
    const tabToClose = openedTabs.find(tab => tab.path === tabToClosePath);
    if (tabToClose?.unsavedChanges) if (!window.confirm(`"${tabToClose.name}" has unsaved changes. Close anyway?`)) return;
    setOpenedTabs(prevTabs => {
      const originalIndex = prevTabs.findIndex(t => t.path === tabToClosePath);
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);
      if (activeTabPathRef.current === tabToClosePath) {
        if (updatedTabs.length > 0) {
          const newIndexToActivate = Math.max(0, Math.min(originalIndex -1, updatedTabs.length - 1)); 
          setActiveTabPath(updatedTabs[newIndexToActivate]?.path || null);
        } else { setActiveTabPath(null); }
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
  
  const normalizedInitialBaseDir = useMemo(() => {
      if (!filePathToEdit) return '/';
      const initialBaseDir = path.dirname(filePathToEdit);
      return path.normalize(initialBaseDir === '.' ? '/' : initialBaseDir);
  }, [filePathToEdit]);

  const normalizedCurrentFileTreePath = useMemo(() => {
      return fileTreePathRef.current;
  }, [fileTreePathRef.current]);

  const treeBackButtonDisabled = useMemo(() => {
    if (!initialDirForResetRef.current && !filePathToEdit) return normalizedCurrentFileTreePath === '/';
    const baseToCompare = initialDirForResetRef.current || normalizedInitialBaseDir;
    return normalizedCurrentFileTreePath === '/' || normalizedCurrentFileTreePath === baseToCompare || isFileTreeLoading;
  }, [normalizedCurrentFileTreePath, filePathToEdit, normalizedInitialBaseDir, isFileTreeLoading, initialDirForResetRef]);
  
  const handleTreeBackClick = useCallback(() => {
    const parentDir = path.dirname(normalizedCurrentFileTreePath);
    const baseToCompare = initialDirForResetRef.current || normalizedInitialBaseDir;
    if (normalizedCurrentFileTreePath === '/' || normalizedCurrentFileTreePath === baseToCompare) return;
    setFileTreePath(parentDir === '.' ? '/' : parentDir);
  }, [setFileTreePath, normalizedCurrentFileTreePath, normalizedInitialBaseDir, initialDirForResetRef]);

  const handleFileTreePathSubmit = useCallback(() => {
    let trimmedPath = fileTreePathInput.trim();
    if (trimmedPath === "") trimmedPath = "/";
    let normalized = path.normalize(trimmedPath);
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    const newTreePath = normalized || '/';
    if (newTreePath !== fileTreePathRef.current) {
      setFileTreePath(newTreePath);
    } else { setFileTreePathInput(newTreePath); }
  }, [fileTreePathInput, setFileTreePath]);

  const performSearch = useCallback(() => {
    const view = editorRef.current?.view;
    const currentSearchQuery = searchQuery.trim();
    if (!view || !currentSearchQuery) { setSearchMatches([]); setCurrentMatchIndex(-1); return; }
    const cursor = new SearchCursor( view.state.doc, currentSearchQuery, 0, view.state.doc.length, isCaseSensitiveSearch ? undefined : (str: string) => str.toLowerCase());
    const matchesFound: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) { matchesFound.push({ from: cursor.value.from, to: cursor.value.to }); }
    setSearchMatches(matchesFound);
    if (matchesFound.length > 0) {
      setCurrentMatchIndex(0);
      setTimeout(() => { if (editorRef.current?.view) editorRef.current.view.dispatch({ selection: EditorSelection.single(matchesFound[0].from, matchesFound[0].to), effects: EditorView.scrollIntoView(matchesFound[0].from, { y: "center" }) }); }, 0);
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${searchQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, toast]);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (!newQuery.trim()) { setSearchMatches([]); setCurrentMatchIndex(-1); }
  }, []);

  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if(searchQuery.trim()) performSearch();
  }, [performSearch, searchQuery]);

  const goToMatch = useCallback((index: number) => {
    if (!editorRef.current?.view || index < 0 || index >= searchMatches.length) return;
    const match = searchMatches[index];
    editorRef.current.view.dispatch({ selection: EditorSelection.single(match.from, match.to), effects: EditorView.scrollIntoView(match.from, { y: "center" }) });
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
    setIsCaseSensitiveSearch(prev => { setTimeout(() => performSearch(), 0); return !prev; });
  }, [performSearch]);

  useEffect(() => {
    if (fileTreeError && isOpen && initialDirForResetRef.current) {
        const currentTreeP = fileTreePathRef.current;
        const initialDir = initialDirForResetRef.current;
        setTimeout(() => toast({ title: "Invalid Path", description: `Path "${currentTreeP}" could not be listed. ${fileTreeError}. Reverting.`, variant: "destructive", duration: 4000 }), 0);
        setFileTreePath(initialDir); setFileTreePathInput(initialDir); setFileTreeError(null);
    }
  }, [fileTreeError, isOpen, toast, setFileTreePath, initialDirForResetRef]);

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
        if (isOpen && currentActiveP && currentActiveTabForShortcut && currentActiveTabForShortcut.isWritable !== false && !currentActiveTabForShortcut.isLoading && !isSavingAll) {
          if(event.shiftKey) { handleSaveAll(); } else { handleSaveChanges(); }
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && isOpen && currentActiveP) {
         if (!isSearchInputFocused && !isTreeInputFocused && isEditorFocused) {
          event.preventDefault();
          if (!isSearchWidgetOpen) { setIsSearchWidgetOpen(true); setTimeout(() => document.getElementById("editor-search-input")?.focus(), 0); } 
          else { document.getElementById("editor-search-input")?.focus(); }
        }
      }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openedTabs, handleSaveChanges, handleSaveAll, isSearchWidgetOpen, isSavingAll]);

  useEffect(() => {
    if (!isSearchWidgetOpen && searchMatches.length > 0) {
        setSearchMatches([]); setCurrentMatchIndex(-1);
        if (editorRef.current?.view) {
            const currentSelection = editorRef.current.view.state.selection.main;
            editorRef.current.view.dispatch({ selection: EditorSelection.single(currentSelection.anchor) });
        }
    }
  }, [isSearchWidgetOpen, searchMatches.length]);

  const saveButtonDisabled = useMemo(() => isSavingAll || !activeTabData || isEditorLoadingForCurrentTab || !isCurrentFileWritable || (!hasUnsavedChangesForCurrentTab && !globalDebugModeActive) || !!editorDisplayErrorForCurrentTab, [isSavingAll, activeTabData, isEditorLoadingForCurrentTab, isCurrentFileWritable, hasUnsavedChangesForCurrentTab, globalDebugModeActive, editorDisplayErrorForCurrentTab]);
  const saveAllButtonDisabled = useMemo(() => isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive), [isSavingAll, anyUnsavedFiles, globalDebugModeActive]);
  const createSnapshotButtonDisabled = useMemo(() => {
     const maxSnapshots = globalDebugModeActive ? MAX_SERVER_SNAPSHOTS + 5 : MAX_SERVER_SNAPSHOTS;
     return isCreatingSnapshot || !activeTabData || !activeTabData.content || isEditorLoadingForCurrentTab || !!editorDisplayErrorForCurrentTab || serverSnapshots.length >= maxSnapshots;
  }, [isCreatingSnapshot, activeTabData, isEditorLoadingForCurrentTab, serverSnapshots, editorDisplayErrorForCurrentTab, globalDebugModeActive]);

  const toolbarButtons = [
    { id: 'save', label: 'Save', icon: Save, onClick: () => handleSaveChanges(), disabled: saveButtonDisabled, isLoading: activeTabData?.isLoading && !isEditorLoadingForCurrentTab && !isSavingAll && activeTabData?.path === activeTabPathRef.current, tooltip: "Save (Ctrl+S)" },
    { id: 'saveAll', label: 'Save All', icon: SaveAll, onClick: handleSaveAll, disabled: saveAllButtonDisabled, isLoading: isSavingAll, tooltip: "Save All Unsaved Tabs (Ctrl+Shift+S)" },
    { id: 'find', label: 'Find', icon: SearchIconLucide, onClick: () => setIsSearchWidgetOpen(prev => !prev), disabled: !activeTabData || !!editorDisplayErrorForCurrentTab, tooltip: "Find in Current File (Ctrl+F)" },
    { id: 'snapshots', label: 'Snapshots', icon: Camera, dropdown: true, disabled: !activeTabData || !!editorDisplayErrorForCurrentTab || isLoadingSnapshots, tooltip: "File Snapshots (Server-Side)" },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, onClick: () => { if (activeTabData?.path) handleOpenOrActivateTab(activeTabData.path, activeTabData.name); else toast({title: "Refresh: No active file"}); }, disabled: !activeTabData, tooltip: "Refresh File Content" },
    { id: 'replace', label: 'Replace', icon: ReplaceIcon, onClick: () => toast({ title: "Replace: Not Implemented" }), disabled: true, tooltip: "Replace Text (Not Implemented)" },
    { id: 'jumpLine', label: 'GoTo', icon: SparklesIcon, onClick: () => toast({ title: "Jump to Line: Not Implemented" }), disabled: true, tooltip: "Jump to Line (Not Implemented)" },
    { id: 'font', label: 'Font', icon: CaseSensitiveIcon, onClick: () => toast({ title: "Font Settings: Not Implemented" }), disabled: true, tooltip: "Font Settings (Not Implemented)" },
    { id: 'theme', label: 'Theme', icon: PaletteIcon, onClick: () => toast({ title: "Editor Theme: Not Implemented" }), disabled: true, tooltip: "Change Editor Theme (Not Implemented)" },
    { id: 'settings', label: 'Settings', icon: EditorSettingsIcon, onClick: () => toast({ title: "Editor Settings: Not Implemented" }), disabled: true, tooltip: "Editor Settings (Not Implemented)" },
    { id: 'help', label: 'Help', icon: HelpCircleIcon, onClick: () => toast({ title: "Help: Not Implemented" }), disabled: true, tooltip: "Editor Help (Not Implemented)" },
  ];

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogContent
        className={cn("fixed inset-0 bg-background p-[60px] flex flex-col overflow-hidden")}
        hideCloseButton={true} 
      >
        <div className="border-4 border-border/60 rounded-lg shadow-xl bg-card flex flex-col flex-1 overflow-hidden">
          {/* 1. Top Bar (No text title, icon buttons, and Close Button) */}
          <DialogHeader className="flex items-center justify-between p-1.5 border-b border-border/60 flex-shrink-0 h-[42px]">
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
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-80 sm:w-96">
                            <DropdownMenuLabel className="text-xs">Server Snapshots</DropdownMenuLabel>
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-0">(Max {MAX_SERVER_SNAPSHOTS}, oldest unlocked pruned)</DropdownMenuLabel>
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
                        </Button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent><p>{btn.tooltip}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
            <TooltipProvider delayDuration={300}><Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleCloseDialog} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Close Editor (Esc)</p></TooltipContent>
            </Tooltip></TooltipProvider>
          </DialogHeader>
          
          {/* Main Content Area: Tab Bar, Active File Info, and then (File Tree | Editor Pane) */}
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            {/* Tab Bar */}
            <div className="flex-shrink-0 border-b border-border/60 bg-muted/20">
              <ScrollArea orientation="horizontal" className="h-auto whitespace-nowrap no-scrollbar">
                <div className="flex p-1.5 gap-1">
                  {/* Tab rendering logic */}
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
                          "absolute right-0.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm transition-opacity",
                          activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80",
                          "opacity-30 group-hover:opacity-100"
                        )}
                        onClick={(e) => handleCloseTab(tab.path, e)}
                        aria-label={`Close tab ${tab.name}`}
                      ><FileX2 className="h-3 w-3" /></Button> 
                    </div>
                  ))}
                  {openedTabs.length === 0 && ( <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open.</div> )}
                </div>
              </ScrollArea>
            </div>
            
            {/* Active File Info Header (Below Tabs) */}
             <div className="flex items-center justify-between text-xs text-muted-foreground p-1.5 border-b border-border/60 bg-muted/40 flex-shrink-0 truncate">
                <div className="flex items-center gap-1">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFileTreeOpen(prev => !prev)}>
                            {isFileTreeOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                        </Button>
                    </TooltipTrigger><TooltipContent>{isFileTreeOpen ? "Close File Tree" : "Open File Tree"}</TooltipContent></Tooltip></TooltipProvider>
                    {activeTabData && <span className="truncate font-mono" title={activeTabData.path}>{activeTabData.path}</span>}
                </div>
                {activeTabData && (
                    <div className="flex items-center space-x-2 shrink-0 ml-2">
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


            {/* Main Content (Tree | Editor) */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* File Tree Sidebar */}
              {isFileTreeOpen && (
                <div className="w-52 bg-muted/40 border-r border-border/60 flex flex-col flex-shrink-0 overflow-hidden">
                  {/* File Tree Header */}
                  <div className="p-1.5 border-b border-border/60 flex items-center gap-1 flex-shrink-0">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={treeBackButtonDisabled} className="h-7 w-7">
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent><p>Up One Level</p></TooltipContent></Tooltip></TooltipProvider>
                    <Input id="file-tree-path-input" className="h-7 text-xs px-2 py-1 flex-grow font-mono bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0" value={fileTreePathInput} onChange={(e) => setFileTreePathInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFileTreePathSubmit(); } }} placeholder="Path..." disabled={isFileTreeLoading} />
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => fetchFileTreeItems(fileTreePathRef.current)} disabled={isFileTreeLoading} className="h-7 w-7">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger><TooltipContent><p>Refresh Tree</p></TooltipContent></Tooltip></TooltipProvider>
                  </div>
                  {/* File Tree List */}
                  <ScrollArea className="flex-grow p-1">
                    {isFileTreeLoading ? <div className="p-3 flex items-center justify-center text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading...</div>
                      : fileTreeError ? <Alert variant="destructive" className="m-2 text-xs"><FileWarning className="h-3 w-3" /><ShadcnAlertTitle className="text-xs font-semibold">Tree Error</ShadcnAlertTitle><AlertDescription className="text-xs">{fileTreeError}</AlertDescription></Alert>
                      : <ul> {fileTreeItems.map((item) => ( <li key={item.name} className="px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs" onClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(path.join(fileTreePathRef.current, item.name), item.name)}> <div className="flex items-center space-x-2"> {getFileIcon(item.name, item.type)} <span className="truncate">{item.name}</span> </div> </li> ))} {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && ( <li className="px-2 py-1 text-xs text-muted-foreground text-center">Empty directory.</li> )} </ul>
                    }
                  </ScrollArea>
                  {/* File Tree Footer */}
                  <div className="p-1 border-t border-border/60 flex items-center justify-around flex-shrink-0">
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toast({title:"New File: Not Implemented"})}><FilePlus className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>New File</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toast({title:"New Folder: Not Implemented"})}><FolderPlus className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>New Folder</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toast({title:"Upload: Not Implemented"})}><Upload className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Upload</TooltipContent></Tooltip></TooltipProvider>
                  </div>
                </div>
              )}
              {/* Editor Pane */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-2 border-border/70 rounded-md shadow-sm">
                <div className="flex-grow relative p-0 bg-background min-h-0">
                  {activeTabData ? (
                    <>
                      {isEditorLoadingForCurrentTab ? ( <div className="absolute inset-0 flex items-center justify-center text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...</div>
                      ) : editorDisplayErrorForCurrentTab ? ( <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center"> <AlertTriangle className="h-6 w-6 mb-2" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{editorDisplayErrorForCurrentTab}</AlertDescription> <Button variant="outline" size="sm" className="mt-3" onClick={() => { if (activeTabPath) { setOpenedTabs(prev => prev.map(t => t.path === activeTabPath ? {...t, content: null, originalContent: null, error: null, isLoading: false} : t)); setTimeout(() => setActiveTabPath(activeTabPath), 0); } }}>Retry</Button> </Alert>
                      ) : (
                        <CodeEditor ref={editorRef} value={editorContentForActiveTab} language={editorLanguageForActiveTab} onChange={handleEditorContentChange} readOnly={isEditorLoadingForCurrentTab || !isCurrentFileWritable || !!editorDisplayErrorForCurrentTab} className="h-full w-full border-0 rounded-none" />
                      )}
                      {isSearchWidgetOpen && activeTabData && !isEditorLoadingForCurrentTab && !editorDisplayErrorForCurrentTab && (
                        <div className="absolute top-1 right-1 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                          {/* Search Widget Content */}
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
                  ) : ( <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center"><p>Select a file or open a tab.</p></div> )}
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

    