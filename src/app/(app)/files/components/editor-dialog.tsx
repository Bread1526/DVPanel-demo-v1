
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
  Replace as ReplaceIcon,
  Sparkles as SparklesIcon,
  Palette as PaletteIcon,
  Settings2 as EditorSettingsIcon,
  HelpCircle as HelpCircleIcon,
  Camera,
  PanelLeftClose,
  PanelRightClose,
  Menu as MenuIcon,
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
import { SearchCursor, openSearchPanel, SearchQuery, replaceNext, replaceAll, setSearchQuery as setCMQuery } from '@codemirror/search';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DialogTitle } from '@radix-ui/react-dialog'; // For sr-only title

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
    case '.js': case '.jsx': case '.ts': case '.tsx': return 'typescript';
    case '.html': case '.htm': return 'html';
    case '.css': case '.scss': case '.sass': return 'css';
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
    case '.png': case '.jpg': case 'jpeg': case '.gif': case '.svg': case '.webp': case '.ico': return <ImageIconLucide className="h-4 w-4 text-purple-500 shrink-0" />;
    case '.zip': case '.tar': case '.gz': case '.rar': case '.7z': return <ArchiveIcon className="h-4 w-4 text-amber-700 shrink-0" />;
    case '.sh': case '.bash': return <ShellIcon className="h-4 w-4 text-green-600 shrink-0" />;
    case '.bat': case '.cmd': return <FileTerminalIcon className="h-4 w-4 text-gray-700 shrink-0" />;
    case '.mp3': case '.wav': case '.ogg': return <AudioWaveformIcon className="h-4 w-4 text-pink-500 shrink-0" />;
    case '.mp4': case '.mov': case '.avi': case '.mkv': return <VideoIconLucide className="h-4 w-4 text-red-500 shrink-0" />;
    case '.db': case '.sqlite': case '.sql': return <DatabaseIcon className="h-4 w-4 text-indigo-500 shrink-0" />;
    case '.csv': case '.xls': case '.xlsx': return <ListIcon className="h-4 w-4 text-green-700 shrink-0" />;
    case '.exe': case '.dmg': case '.app': return <EditorSettingsIcon className="h-4 w-4 text-gray-800 shrink-0" />;
    case '.pem': case '.crt': case '.key': return <ShieldIcon className="h-4 w-4 text-teal-500 shrink-0" />;
    case '.gitignore': case '.gitattributes': case '.gitmodules': return <GithubIcon className="h-4 w-4 text-neutral-700 shrink-0" />;
    default: return <FileIconDefault className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

type ActiveEditorWidgetType = 'find' | 'replace' | 'jump' | null;


export default function EditorDialog({ isOpen, onOpenChange, filePathToEdit }: EditorDialogProps) {
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null); // For potential future use with centering logic
  const dialogTitleId = React.useId();

  // Global states for the dialog
  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  
  // Tabs management
  const [openedTabs, setOpenedTabs] = useState<OpenedTabInfo[]>([]);
  const [activeTabPath, setActiveTabPathInternal] = useState<string | null>(null);
  const activeTabPathRef = useRef<string | null>(null); // Ref to hold current activeTabPath for async ops

  // File tree management
  const [fileTreePath, setFileTreePathState] = useState<string>('/'); // Internal state for normalized path
  const [fileTreePathInput, setFileTreePathInput] = useState<string>('/'); // For the input field
  const fileTreePathRef = useRef<string>('/'); // Ref to hold current fileTreePath for async ops
  const initialDirForResetRef = useRef<string>('/'); // To reset tree path on errors
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false); // Default to closed

  // Snapshots management
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);

  // Editor widgets (Find, Replace, Jump to Line)
  const [activeEditorWidget, setActiveEditorWidgetInternal] = useState<ActiveEditorWidgetType>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceWithValue, setReplaceWithValue] = useState("");
  const [jumpLineInput, setJumpLineInput] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  // Save All state
  const [isSavingAll, setIsSavingAll] = useState(false);

  const activeEditorWidgetRef = useRef<ActiveEditorWidgetType>(null);
  
  const setActiveEditorWidget = useCallback((widget: ActiveEditorWidgetType) => {
    activeEditorWidgetRef.current = widget;
    setActiveEditorWidgetInternal(widget);
  }, []);

  const activeTabData = useMemo(() => {
    if (!activeTabPath) return null;
    return openedTabs.find(tab => tab.path === activeTabPath) || null;
  }, [openedTabs, activeTabPath]);

  const editorContentForActiveTab = useMemo(() => activeTabData?.content ?? "", [activeTabData]);
  const editorLanguageForActiveTab = useMemo(() => activeTabData?.language ?? "plaintext", [activeTabData]);
  const isCurrentFileWritable = useMemo(() => activeTabData?.isWritable ?? false, [activeTabData]);
  const hasUnsavedChangesForActiveTab = useMemo(() => activeTabData?.unsavedChanges ?? false, [activeTabData]);
  const anyUnsavedFiles = useMemo(() => openedTabs.some(tab => tab.unsavedChanges), [openedTabs]);
  
  const lineCount = useMemo(() => editorContentForActiveTab.split('\n').length, [editorContentForActiveTab]);
  const charCount = useMemo(() => editorContentForActiveTab.length, [editorContentForActiveTab]);
  
  const activeFileDirForInfoBar = useMemo(() => activeTabData ? path.dirname(activeTabData.path) : "N/A", [activeTabData]);
  const activeFileLangForInfoBar = useMemo(() => editorLanguageForActiveTab ? editorLanguageForActiveTab.charAt(0).toUpperCase() + editorLanguageForActiveTab.slice(1) : "N/A", [editorLanguageForActiveTab]);
  const dialogTitleForHeader = useMemo(() => activeTabData?.name || (filePathToEdit ? path.basename(filePathToEdit) : '') || "File Editor", [activeTabData, filePathToEdit]);


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
    if (globalDebugModeActive) console.log('[EditorDialog] setFileTreePath. Old ref:', fileTreePathRef.current, 'New to set:', newPath, 'Normalized:', normalizedPath);
    
    fileTreePathRef.current = normalizedPath; 
    setFileTreePathState(prevTreePath => {
      if (prevTreePath !== normalizedPath) {
        if (globalDebugModeActive) console.log(`[EditorDialog] setFileTreePathState: Updating tree path from "${prevTreePath}" to "${normalizedPath}"`);
        return normalizedPath;
      }
      return prevTreePath;
    });
    setFileTreePathInput(normalizedPath); 
  }, [globalDebugModeActive]);


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
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems for ${pathToDisplay} STALE (tree path changed during fetch). Aborting UI update for this fetch.`);
        if (fileTreePathRef.current === pathToDisplay) setIsFileTreeLoading(false);
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        let errData;
        try { errData = errText ? JSON.parse(errText) : { error: `Status: ${response.status}` }; }
        catch { errData = { error: `Status: ${response.status}. Response: ${errText.substring(0, 100)}...` }; }
        throw new Error(errData.error || `List directory failed for "${path.basename(pathToDisplay) || pathToDisplay}". Status: ${response.status}`);
      }
      const data = await response.json();
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems RESPONSE for path: ${pathToDisplay}`, data);
      
      if (isOpen && fileTreePathRef.current === pathToDisplay) {
        setFileTreeItems(Array.isArray(data.files) ? data.files : []);
        setFileTreeError(null);
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
    const currentActiveP = activeTabPathRef.current;
    if (!filePathForSnapshots || !isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Conditions not met. Path: ${filePathForSnapshots}, isOpen: ${isOpen}. Clearing serverSnapshots state.`);
      setServerSnapshots([]); return;
    }
     if (filePathForSnapshots !== currentActiveP && isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots: Request for ${filePathForSnapshots} is STALE (current active is ${currentActiveP}). Aborting snapshot fetch.`);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots CALLED for: ${filePathForSnapshots}`);
    setIsLoadingSnapshots(true); setSnapshotError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(filePathForSnapshots)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (activeTabPathRef.current !== filePathForSnapshots && isOpen) {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots for ${filePathForSnapshots} became STALE after fetch. Aborting UI update for snapshots.`);
        if (activeTabPathRef.current === filePathForSnapshots) setIsLoadingSnapshots(false);
        return;
      }
      if (!response.ok) {
        const errorText = await response.text(); let errorJson;
        try { errorJson = JSON.parse(errorText); } catch { errorJson = { error: `Snapshots load error for ${path.basename(filePathForSnapshots)}. Status: ${response.status}` }; }
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
        setTimeout(() => toast({ title: "Snapshot Load Error", description: errorMsg, variant: "destructive" }),0);
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
      if (existingTabIndex !== -1) {
        const existingTab = prevTabs[existingTabIndex];
        const newTabs = [...prevTabs.slice(0, existingTabIndex), ...prevTabs.slice(existingTabIndex + 1), existingTab];
        if (globalDebugModeActive) console.log(`[EditorDialog] Tab ${filePath} already open, moving to end.`);
        return newTabs;
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] Tab ${filePath} is new, adding.`);
        return [...prevTabs, {
          path: filePath,
          name: resolvedFileName,
          content: null, 
          originalContent: null,
          language: getLanguageFromFilename(resolvedFileName),
          isWritable: null, 
          isLoading: false, // Will be set true by main effect if content needs loading
          error: null,
          unsavedChanges: false,
        }];
      }
    });
    setActiveTabPath(filePath);
  }, [setActiveTabPath, globalDebugModeActive]);


  const handleCreateSnapshot = useCallback(async () => {
    const currentActiveP = activeTabPathRef.current;
    const currentTab = openedTabs.find(t => t.path === currentActiveP);

    if (!currentTab || currentTab.content === null || !currentActiveP) {
      setTimeout(() => toast({ title: "Snapshot Error", description: "No active file content to snapshot.", variant: "destructive" }),0); return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] handleCreateSnapshot: Creating server snapshot for ${currentActiveP}`);
    setIsCreatingSnapshot(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentActiveP, content: currentTab.content, language: currentTab.language })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error ${response.status} creating snapshot.` }));
        throw new Error(errorData.error || `Failed to create snapshot on server for ${currentTab.name}.`);
      }
      const result = await response.json();
      if (globalDebugModeActive) console.log("[EditorDialog] handleCreateSnapshot API Response:", result);
      setTimeout(() => toast({ title: 'Snapshot Created', description: `Server snapshot for ${currentTab.name} created.` }),0);
      if (activeTabPathRef.current === currentActiveP) { 
         fetchSnapshots(currentActiveP); // Re-fetch to get the updated list including the new one
      }
    } catch (e: any) {
      console.error('[EditorDialog] handleCreateSnapshot Error:', e);
      setSnapshotError(e.message);
      setTimeout(() => toast({ title: "Snapshot Creation Error", description: e.message, variant: "destructive" }),0);
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [openedTabs, toast, globalDebugModeActive, fetchSnapshots]);


  const handleSaveChanges = useCallback(async (tabPathToSave?: string) => {
    const currentActiveP = activeTabPathRef.current;
    const pathToSave = tabPathToSave || currentActiveP;

    if (!pathToSave) {
      setTimeout(() => toast({ title: "Save Error", description: "No active file to save.", variant: "destructive" }),0); return { success: false };
    }
    const tabIndex = openedTabs.findIndex(t => t.path === pathToSave);
    if (tabIndex === -1) {
      setTimeout(() => toast({ title: "Save Error", description: `File ${path.basename(pathToSave)} not found.`, variant: "destructive" }),0); return { success: false };
    }
    
    let tabData = openedTabs[tabIndex];
    if (tabData.content === null) {
      setTimeout(() => toast({ title: "Save Error", description: `Cannot save ${tabData.name}: No content.`, variant: "destructive" }),0); return { success: false };
    }
    if (!tabData.isWritable) {
      setTimeout(() => toast({ title: "Save Error", description: `Cannot save ${tabData.name}: File is not writable.`, variant: "destructive" }),0); return { success: false };
    }

    const shouldCreateSnapshotBeforeSave = (tabData.unsavedChanges || globalDebugModeActive);
    if (shouldCreateSnapshotBeforeSave) {
        if(globalDebugModeActive) console.log(`[EditorDialog] Auto-snapshotting ${pathToSave} before save. Unsaved: ${tabData.unsavedChanges}, Debug: ${globalDebugModeActive}`);
        await handleCreateSnapshot(); 
    }
    
    setOpenedTabs(prev => prev.map((t, i) => i === tabIndex ? { ...t, isLoading: true } : t));
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tabData.path, content: tabData.content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Save failed for ${tabData.name}.`);
      
      setTimeout(() => toast({ title: 'Success', description: `File ${tabData.name} saved.` }),0);
      setOpenedTabs(prev => prev.map((t, i) =>
        i === tabIndex 
        ? { ...t, originalContent: t.content, unsavedChanges: false, isLoading: false, isWritable: true, error: null } 
        : t
      ));
      return { success: true };
    } catch (e: any) {
      setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive" }),0);
      setOpenedTabs(prev => prev.map((t, i) => 
         i === tabIndex ? { ...t, isLoading: false, error: e.message } : t
      ));
      return { success: false };
    }
  }, [openedTabs, globalDebugModeActive, toast, handleCreateSnapshot, activeTabPathRef]);


  const handleCloseDialog = useCallback(() => {
    if (anyUnsavedFiles) {
      if (!window.confirm("You have unsaved changes in one or more tabs. Close editor anyway?")) return;
    }
    onOpenChange(false);
    setOpenedTabs([]);
    setActiveTabPath(null);
    setFileTreePathState('/'); 
    setFileTreePathInput('/');
    initialDirForResetRef.current = '/';
    setServerSnapshots([]);
    setSnapshotError(null);
    setActiveEditorWidget(null);
    setSearchQuery(""); setReplaceWithValue(""); setJumpLineInput(""); setSearchMatches([]); setCurrentMatchIndex(-1);
  }, [anyUnsavedFiles, onOpenChange, setActiveTabPath, setFileTreePathState]);


  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Main Initialization effect. isOpen:", isOpen, "filePathToEdit:", filePathToEdit);
    
    loadPanelSettings().then(settingsResult => {
      if (settingsResult.data) setGlobalDebugModeActive(settingsResult.data.debugMode ?? false);
    });

    if (isOpen) {
      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit) || '/';
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        initialDirForResetRef.current = normalizedInitialDir;
        
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: Setting fileTreePath to ${normalizedInitialDir} and opening tab for ${filePathToEdit}`);
        setFileTreePath(normalizedInitialDir); 
        handleOpenOrActivateTab(filePathToEdit);
      } else {
        const defaultDir = initialDirForResetRef.current || '/';
        const normalizedDefaultDir = path.normalize(defaultDir === '.' ? '/' : defaultDir);
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing without filePathToEdit. Setting tree to: ${normalizedDefaultDir}`);
        setFileTreePath(normalizedDefaultDir);
        
        if (openedTabs.length > 0 && !activeTabPathRef.current) {
           setActiveTabPath(openedTabs[openedTabs.length - 1].path);
        } else if (openedTabs.length === 0) {
           setActiveTabPath(null);
        }
      }
      setActiveEditorWidget(null);
    }
  }, [isOpen, filePathToEdit, handleOpenOrActivateTab, setActiveTabPath, setFileTreePath, globalDebugModeActive]);


  useEffect(() => {
    fileTreePathRef.current = fileTreePath; 
    if (isOpen && fileTreePath) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[fileTreePath]: Path for tree changed to ${fileTreePath}. Triggering fetch.`);
      fetchFileTreeItems(fileTreePath);
    }
  }, [fileTreePath, isOpen, globalDebugModeActive, fetchFileTreeItems]);


  useEffect(() => {
    const currentActiveTabPath = activeTabPathRef.current;
    if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs] START. Active path: ${currentActiveTabPath}, Num open tabs: ${openedTabs.length}, isOpen: ${isOpen}`);
    
    if (!currentActiveTabPath || !isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: No active tab or dialog closed. Skipping actions.`);
      return;
    }

    const activeTabIndex = openedTabs.findIndex(tab => tab.path === currentActiveTabPath);
    if (activeTabIndex === -1) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Active tab ${currentActiveTabPath} NOT FOUND. This is unexpected.`);
      return;
    }
    
    const tabToLoad = openedTabs[activeTabIndex];

    if (tabToLoad.content === null && !tabToLoad.isLoading && !tabToLoad.error) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Tab ${currentActiveTabPath} needs content. Starting fetch.`);
      
      setOpenedTabs(prevTabs => prevTabs.map((t) =>
        t.path === currentActiveTabPath ? { ...t, isLoading: true, error: null } : t
      ));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content fetch for ${currentActiveTabPath} TIMEOUT.`);
      }, CONTENT_FETCH_TIMEOUT_MS);

      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(currentActiveTabPath)}&view=true`, { signal: controller.signal })
        .then(async response => {
          clearTimeout(timeoutId);
          if (activeTabPathRef.current !== currentActiveTabPath && isOpen) {
             if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content fetch for ${currentActiveTabPath} STALE. Aborting UI update.`);
             setOpenedTabs(prevTabs => prevTabs.map(t => (t.path === currentActiveTabPath && t.isLoading) ? { ...t, isLoading: false } : t));
             return null; 
          }
          if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try { errorJson = errorText ? JSON.parse(errorText) : {error: `HTTP ${response.status}`}; }
            catch { errorJson = {error: `Server Error ${response.status}: ${errorText.substring(0,100)}...`};}
            throw new Error(errorJson.error || `Failed to load content for ${path.basename(currentActiveTabPath)}.`);
          }
          return response.json();
        })
        .then(data => {
          if (data && isOpen && activeTabPathRef.current === currentActiveTabPath) {
            if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content fetch for ${currentActiveTabPath} SUCCESS. Writable: ${data.writable}`);
            setOpenedTabs(prevTabs => prevTabs.map((t) =>
              t.path === currentActiveTabPath
              ? { ...t, content: data.content, originalContent: data.content, isWritable: data.writable, isLoading: false, error: null, unsavedChanges: false }
              : t
            ));
            fetchSnapshots(currentActiveTabPath);
          }
        })
        .catch((e) => { // Removed :any
          clearTimeout(timeoutId);
          if (isOpen && activeTabPathRef.current === currentActiveTabPath) {
            const errorMsg = e.name === 'AbortError' ? 'Timeout fetching content.' : (e.message || "Failed to load content.");
            if (globalDebugModeActive) console.error(`[EditorDialog] useEffect[activeTabPath]: Content fetch for ${currentActiveTabPath} ERROR:`, errorMsg, e);
            setOpenedTabs(prevTabs => prevTabs.map((t) =>
              t.path === currentActiveTabPath ? { ...t, isLoading: false, error: errorMsg, content: "" } : t
            ));
          }
        });
    } else if (tabToLoad.content !== null && !tabToLoad.isLoading && !tabToLoad.error) {
       if (serverSnapshots.length === 0 && !isLoadingSnapshots && !snapshotError && currentActiveTabPath === tabToLoad.path) {
           if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content exists for ${currentActiveTabPath}, snapshots not loaded. Triggering snapshot fetch.`);
           fetchSnapshots(currentActiveTabPath);
       }
    } else if (tabToLoad.isLoading && globalDebugModeActive) {
        console.log(`[EditorDialog] useEffect[activeTabPath]: Content for ${currentActiveTabPath} is already loading.`);
    } else if (tabToLoad.error && globalDebugModeActive) {
        console.log(`[EditorDialog] useEffect[activeTabPath]: Tab ${currentActiveTabPath} has an error: ${tabToLoad.error}`);
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, fetchSnapshots, isLoadingSnapshots, snapshotError, serverSnapshots.length]);


  useEffect(() => {
    if (fileTreeError && isOpen) {
      const currentTreeP = fileTreePathRef.current;
      const initialDirToUseForReset = initialDirForResetRef.current;
      if (globalDebugModeActive) console.log(`[EditorDialog] File tree error detected: "${fileTreeError}". Current tree path: "${currentTreeP}", Initial base for reset: "${initialDirToUseForReset}"`);
      
      setTimeout(() => {
        toast({ title: "Invalid Path", description: `Path "${currentTreeP}" not found or error: ${fileTreeError}. Reverting to "${initialDirToUseForReset}".`, variant: "destructive", duration: 5000 });
      },0);

      if (currentTreeP !== initialDirToUseForReset) {
        if (globalDebugModeActive) console.log(`[EditorDialog] Tree error: Reverting tree path to initialDirForResetRef: ${initialDirToUseForReset}`);
        setFileTreePath(initialDirToUseForReset);
      } else if (initialDirToUseForReset !== '/'){
        if (globalDebugModeActive) console.log(`[EditorDialog] Tree error: Already at initialDir (${initialDirToUseForReset}), which errored. Reverting to root.`);
        setFileTreePath('/');
      } else {
         if (globalDebugModeActive) console.log(`[EditorDialog] Tree error: Already at root and it errored. Clearing items. Error will persist for this path unless input changes.`);
         setFileTreeItems([]);
      }
    }
  }, [fileTreeError, isOpen, toast, globalDebugModeActive, setFileTreePath]);


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


  const handleSaveAll = useCallback(async () => {
    setIsSavingAll(true);
    if (globalDebugModeActive) console.log('[EditorDialog] handleSaveAll: Starting to save all unsaved files.');
    let successCount = 0; let errorCount = 0;
    const unsavedTabsToProcess = openedTabs.filter(tab => tab.unsavedChanges || (globalDebugModeActive && tab.isWritable));

    for (const tab of unsavedTabsToProcess) {
      if (globalDebugModeActive) console.log(`[EditorDialog] handleSaveAll: Processing tab ${tab.path}.`);
      const result = await handleSaveChanges(tab.path);
      if (result.success) successCount++; else errorCount++;
    }
    setIsSavingAll(false);
    const message = errorCount > 0 ? `${successCount} saved. ${errorCount} failed.` : `${successCount} file(s) saved.`;
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
          const newIndexToActivate = Math.max(0, Math.min(indexToClose, updatedTabs.length - 1)); // Try to activate tab to the right, or the new last one
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


  const handleTreeFileClick = useCallback((fileName: string) => {
    const fullPath = path.join(fileTreePathRef.current, fileName);
    handleOpenOrActivateTab(fullPath, fileName);
  }, [handleOpenOrActivateTab]);


  const handleFileTreePathSubmit = useCallback(async () => {
    let trimmedPath = fileTreePathInput.trim();
    if (!trimmedPath.startsWith('/')) trimmedPath = '/' + trimmedPath;
    const normalized = path.normalize(trimmedPath);
    let newTreePath = (normalized === '.' || normalized === '') ? '/' : normalized;
    if (newTreePath !== '/' && newTreePath.endsWith('/')) {
        newTreePath = newTreePath.slice(0, -1);
    }
    
    if (newTreePath !== fileTreePathRef.current) {
      await fetchFileTreeItems(newTreePath); // Fetch first to see if it's valid
      // fetchFileTreeItems will set fileTreeError if path is bad.
      // The useEffect[fileTreeError] will handle reverting if needed.
      // If fetch is successful, it means path is valid.
      if (!fileTreeError) { // Check error state AFTER fetch attempt
          setFileTreePath(newTreePath); // Only update if valid
      }
    } else {
      fetchFileTreeItems(newTreePath); // Re-fetch if path is same
    }
  }, [fileTreePathInput, setFileTreePath, fetchFileTreeItems, fileTreeError]);


  const handleTreeBackClick = useCallback(() => {
    const currentTreeP = fileTreePathRef.current;
    if (treeBackButtonDisabled) return;
    let parentDir = path.dirname(currentTreeP);
    parentDir = (parentDir === '.' || parentDir === '') ? '/' : parentDir;
    setFileTreePath(parentDir);
  }, [setFileTreePath, treeBackButtonDisabled]);


  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshotToLoad = serverSnapshots.find(s => s.id === snapshotId);
    const currentActiveP = activeTabPathRef.current;
    if (!snapshotToLoad || !currentActiveP) return;

    if (globalDebugModeActive) console.log(`[EditorDialog] handleLoadSnapshot: Loading snapshot ID ${snapshotId} into ${currentActiveP}`);
    setOpenedTabs(prevTabs => prevTabs.map(tab =>
      tab.path === currentActiveP
      ? { ...tab, content: snapshotToLoad.content, originalContent: snapshotToLoad.content, language: snapshotToLoad.language, unsavedChanges: false, error: null, isLoading: false }
      : tab
    ));
    setTimeout(() => toast({ title: "Snapshot Loaded", description: `Content from snapshot ${formatDistanceToNowStrict(new Date(snapshotToLoad.timestamp), { addSuffix: true })} loaded.` }),0);
  }, [serverSnapshots, toast, globalDebugModeActive]);


  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSnapshotLock: Toggling lock for snapshot ID ${snapshotId} to ${!isCurrentlyLocked} for file ${currentActiveP}`);
    
    const previousSnapshots = [...serverSnapshots];
    setServerSnapshots(prev => prev.map(s => s.id === snapshotId ? {...s, isLocked: !isCurrentlyLocked} : s));

    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, filePath: currentActiveP, lock: !isCurrentlyLocked })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error ${response.status} updating lock.`}));
        throw new Error(errorData.error || 'Failed to update lock status on server.');
      }
      const result = await response.json();
      setTimeout(() => toast({ title: 'Lock Updated', description: `Snapshot ${!isCurrentlyLocked ? 'locked' : 'unlocked'}.` }),0);
      if (activeTabPathRef.current === currentActiveP) {
        fetchSnapshots(currentActiveP); // Re-fetch to ensure consistency
      }
    } catch (e: any) {
      console.error('[EditorDialog] handleSnapshotLock Error:', e);
      setTimeout(() => toast({ title: "Lock Update Error", description: e.message, variant: "destructive" }),0);
      if(activeTabPathRef.current === currentActiveP) setServerSnapshots(previousSnapshots);
    }
  }, [serverSnapshots, toast, globalDebugModeActive, fetchSnapshots]);


  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const currentActiveP = activeTabPathRef.current;
    if (!currentActiveP) return;

    const snapshotToDelete = serverSnapshots.find(s => s.id === snapshotId);
    if (snapshotToDelete?.isLocked) {
      setTimeout(() => toast({ title: "Cannot Delete", description: "Locked snapshots cannot be deleted.", variant: "destructive" }),0); return;
    }
    if (!window.confirm("Are you sure you want to delete this server snapshot? This action cannot be undone.")) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] handleDeleteSnapshot: Deleting server snapshot ID ${snapshotId} for file ${currentActiveP}`);

    const previousSnapshots = [...serverSnapshots];
    setServerSnapshots(prev => prev.filter(s => s.id !== snapshotId));

    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentActiveP)}&snapshotId=${snapshotId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error ${response.status} deleting snapshot.`}));
        throw new Error(errorData.error || 'Failed to delete snapshot on server.');
      }
      const result = await response.json();
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: 'Server snapshot removed.' }),0);
      if (activeTabPathRef.current === currentActiveP) {
        fetchSnapshots(currentActiveP); // Re-fetch
      }
    } catch (e: any) {
      console.error('[EditorDialog] handleDeleteSnapshot Error:', e);
      setTimeout(() => toast({ title: "Snapshot Delete Error", description: e.message, variant: "destructive" }),0);
      if(activeTabPathRef.current === currentActiveP) setServerSnapshots(previousSnapshots);
    }
  }, [serverSnapshots, toast, globalDebugModeActive, fetchSnapshots]);


  const handleViewSnapshotInPopup = useCallback((snapshot: Snapshot) => {
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  }, []);


  const toggleEditorWidget = useCallback((widget: ActiveEditorWidgetType) => {
    setActiveEditorWidget(prev => {
      const newWidget = prev === widget ? null : widget;
      if (newWidget === 'find' && editorRef.current?.view) {
        const selection = editorRef.current.view.state.selection.main;
        if (!selection.empty) {
          const selectedText = editorRef.current.view.state.sliceDoc(selection.from, selection.to);
          setSearchQuery(selectedText);
          // Defer performSearch to allow state to update for search query
          setTimeout(() => { if(activeEditorWidgetRef.current === 'find') performSearch(selectedText, isCaseSensitiveSearch); }, 0);
        } else if (searchQuery && newWidget === 'find') {
          setTimeout(() => { if(activeEditorWidgetRef.current === 'find') performSearch(searchQuery, isCaseSensitiveSearch); }, 0);
        }
      }
      return newWidget;
    });
  }, [searchQuery, isCaseSensitiveSearch]); // performSearch removed from deps


  const performSearch = useCallback((query?: string, caseSensitive?: boolean) => {
    const view = editorRef.current?.view;
    const currentQuery = (query !== undefined ? query : searchQuery).trim();
    const currentCaseSensitive = caseSensitive !== undefined ? caseSensitive : isCaseSensitiveSearch;

    if (globalDebugModeActive) console.log(`[EditorDialog] performSearch: Query='${currentQuery}', CaseSensitive=${currentCaseSensitive}`);
    if (!view || !currentQuery) {
      setSearchMatches([]); setCurrentMatchIndex(-1); return;
    }
    
    const cmQuery = new SearchQuery({ search: currentQuery, caseSensitive: currentCaseSensitive, replace: replaceWithValue });
    view.dispatch(setCMQuery.of(cmQuery));

    const cursor = new SearchCursor( view.state.doc, currentQuery, 0, view.state.doc.length, currentCaseSensitive ? undefined : (a,b) => a.toLowerCase() === b.toLowerCase() );
    const newSearchMatches: Array<{ from: number; to: number }> = [];
    while (!cursor.next().done) { newSearchMatches.push({ from: cursor.value.from, to: cursor.value.to }); }
    setSearchMatches(newSearchMatches);

    if(globalDebugModeActive) console.log(`[EditorDialog] performSearch: Found ${newSearchMatches.length} matches.`);
    if (newSearchMatches.length > 0) {
      setCurrentMatchIndex(0);
      setTimeout(() => {
        if (editorRef.current?.view) {
          editorRef.current.view.dispatch({
            selection: EditorSelection.single(newSearchMatches[0].from, newSearchMatches[0].to),
            effects: EditorView.scrollIntoView(newSearchMatches[0].from, { y: "center" })
          });
        }
      }, 0);
    } else {
      setCurrentMatchIndex(-1);
      setTimeout(() => toast({ title: "Not Found", description: `"${currentQuery}" was not found.`, duration: 2000 }),0);
    }
  }, [searchQuery, isCaseSensitiveSearch, replaceWithValue, toast, globalDebugModeActive]);


  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setSearchQuery(newQuery);
    if (activeEditorWidgetRef.current === 'find') {
      if (newQuery.trim()) {
        performSearch(newQuery, isCaseSensitiveSearch);
      } else {
        setSearchMatches([]); setCurrentMatchIndex(-1);
      }
    }
  }, [performSearch, isCaseSensitiveSearch]);


  const handleSearchSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (searchQuery.trim()) performSearch(searchQuery, isCaseSensitiveSearch);
  }, [performSearch, searchQuery, isCaseSensitiveSearch]);


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
    if (searchMatches.length === 0 && searchQuery.trim()) {
        performSearch(searchQuery, isCaseSensitiveSearch);
    } else if (searchMatches.length > 0) {
        goToMatch((currentMatchIndex + 1) % searchMatches.length);
    }
  }, [currentMatchIndex, searchMatches, goToMatch, searchQuery, isCaseSensitiveSearch, performSearch]);


  const handlePreviousSearchMatch = useCallback(() => {
     if (searchMatches.length === 0 && searchQuery.trim()) {
        performSearch(searchQuery, isCaseSensitiveSearch);
    } else if (searchMatches.length > 0) {
        goToMatch((currentMatchIndex - 1 + searchMatches.length) % searchMatches.length);
    }
  }, [currentMatchIndex, searchMatches, goToMatch, searchQuery, isCaseSensitiveSearch, performSearch]);


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


  const handleReplaceNext = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || !searchQuery.trim()) return;
    const currentCMQuery = new SearchQuery({ search: searchQuery, caseSensitive: isCaseSensitiveSearch, replace: replaceWithValue });
    view.dispatch(setCMQuery.of(currentCMQuery));
    
    if (replaceNext(view)) { 
       if (globalDebugModeActive) console.log("[EditorDialog] Replaced next occurrence.");
       setTimeout(() => performSearch(searchQuery, isCaseSensitiveSearch), 50);
    } else {
        setTimeout(() => toast({ title: "Replace", description: "No more occurrences found.", duration: 2000 }), 0);
    }
  }, [searchQuery, replaceWithValue, isCaseSensitiveSearch, toast, globalDebugModeActive, performSearch]);


  const handleReplaceAll = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || !searchQuery.trim()) return;
    const currentCMQuery = new SearchQuery({ search: searchQuery, caseSensitive: isCaseSensitiveSearch, replace: replaceWithValue });
    view.dispatch(setCMQuery.of(currentCMQuery));

    if (replaceAll(view)) { 
        if (globalDebugModeActive) console.log("[EditorDialog] Replaced all occurrences.");
        setSearchMatches([]); 
        setCurrentMatchIndex(-1);
        setTimeout(() => toast({ title: "Replace All", description: "All occurrences replaced.", duration: 2000 }), 0);
    } else {
        setTimeout(() => toast({ title: "Replace All", description: "No occurrences found.", duration: 2000 }), 0);
    }
  }, [searchQuery, replaceWithValue, isCaseSensitiveSearch, toast, globalDebugModeActive]);


  const handleJumpToLine = useCallback(() => {
    const view = editorRef.current?.view;
    const lineNum = parseInt(jumpLineInput, 10);
    if (!view || isNaN(lineNum) || lineNum <= 0 || lineNum > view.state.doc.lines) {
      setTimeout(() => toast({ title: "Jump to Line", description: "Invalid line number.", variant: "destructive", duration: 2000 }), 0); return;
    }
    try {
        const line = view.state.doc.line(lineNum);
        view.dispatch({
          selection: EditorSelection.single(line.from, line.to),
          effects: EditorView.scrollIntoView(line.from, { y: "center" })
        });
        setActiveEditorWidget(null);
    } catch (e) {
        setTimeout(() => toast({ title: "Jump to Line", description: "Error jumping to line.", variant: "destructive", duration: 2000 }), 0);
        console.error("[EditorDialog] Error in handleJumpToLine:", e);
    }
  }, [jumpLineInput, toast, setActiveEditorWidget]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      const activeElement = document.activeElement;
      const isInputOutsideEditorFocused = 
          (activeElement?.tagName === 'INPUT' && !(activeElement as HTMLElement).closest('.cm-editor')) || 
          (activeElement?.tagName === 'TEXTAREA' && !(activeElement as HTMLElement).closest('.cm-editor'));
      const isEditorFocused = editorRef.current?.view?.hasFocus ?? false;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          if (!isSavingAll && anyUnsavedFiles) handleSaveAll();
        } else {
            const currentActiveTab = openedTabs.find(t => t.path === activeTabPathRef.current);
            if (currentActiveTab?.isWritable && !currentActiveTab.isLoading && (currentActiveTab.unsavedChanges || globalDebugModeActive) && !isSavingAll) {
                handleSaveChanges();
            }
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        if (isEditorFocused || !isInputOutsideEditorFocused) { 
            event.preventDefault(); 
            toggleEditorWidget('find'); 
        }
      }
      if (event.key === 'Escape') {
        if (activeEditorWidgetRef.current) { event.preventDefault(); event.stopPropagation(); setActiveEditorWidget(null); }
        else if (isSnapshotViewerOpen) { /* Handled by its own dialog */ }
        else if (isOpen) { event.preventDefault(); handleCloseDialog(); }
      }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openedTabs, isSavingAll, anyUnsavedFiles, globalDebugModeActive, handleSaveAll, handleSaveChanges, isSnapshotViewerOpen, handleCloseDialog, toggleEditorWidget, setActiveEditorWidget]);


  useEffect(() => {
    if (globalDebugModeActive) console.log('[EditorDialog] useEffect[activeEditorWidget, activeTabPath] for search cleanup. Widget:', activeEditorWidgetRef.current, 'ActiveTab:', activeTabPath);
    if (!activeEditorWidgetRef.current && searchMatches.length > 0) { // If widget is closed (null) and matches exist
      if (globalDebugModeActive) console.log('[EditorDialog] Search widget closed or tab changed, clearing search state for tab:', activeTabPath);
      setSearchMatches([]); 
      setCurrentMatchIndex(-1);
    }
  }, [activeTabPath, globalDebugModeActive]); // Removed activeEditorWidget and searchMatches.length to only clear on tab change when widget is NOT active

  const normalizedInitialBaseDir = useMemo(() => {
    if (!filePathToEdit) return initialDirForResetRef.current || '/';
    const initialBaseDir = path.dirname(filePathToEdit);
    let normalized = path.normalize(initialBaseDir);
    if (normalized === '.' || normalized === '') normalized = '/';
    if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized;
  }, [filePathToEdit]);

  const treeBackButtonDisabled = useMemo(() => {
    if (isFileTreeLoading) return true;
    const currentTree = fileTreePathRef.current || '/'; 
    if (!filePathToEdit && !initialDirForResetRef.current) return currentTree === '/'; // Case where dialog opens without a file
    const baseDir = initialDirForResetRef.current || path.dirname(filePathToEdit || '/');
    const normalizedBase = path.normalize(baseDir === '.' || baseDir === '' ? '/' : baseDir);
    if (currentTree === normalizedBase && normalizedBase !== '/') return true; 
    return currentTree === '/';
  }, [isFileTreeLoading, filePathToEdit]);

  const saveButtonDisabled = useMemo(() => isSavingAll || !activeTabData || activeTabData.isLoading || !isCurrentFileWritable || (!hasUnsavedChangesForActiveTab && !globalDebugModeActive) || !!activeTabData.error, [isSavingAll, activeTabData, isCurrentFileWritable, hasUnsavedChangesForActiveTab, globalDebugModeActive]);
  const saveAllButtonDisabled = useMemo(() => isSavingAll || (!anyUnsavedFiles && !globalDebugModeActive), [isSavingAll, anyUnsavedFiles, globalDebugModeActive]);
  const createSnapshotButtonDisabled = useMemo(() => {
    const maxSnapshots = MAX_SERVER_SNAPSHOTS;
    return isCreatingSnapshot || !activeTabData || !activeTabData.content || activeTabData.isLoading || !!activeTabData.error || serverSnapshots.length >= maxSnapshots || (!hasUnsavedChangesForActiveTab && !globalDebugModeActive);
  }, [isCreatingSnapshot, activeTabData, serverSnapshots.length, hasUnsavedChangesForActiveTab, globalDebugModeActive]);

  const toolbarButtons = useMemo(() => [
    { id: 'save', label: 'Save', icon: Save, onClick: () => handleSaveChanges(), disabled: saveButtonDisabled, tooltip: "Save Active File (Ctrl+S)" },
    { id: 'saveAll', label: 'Save All', icon: SaveAll, onClick: handleSaveAll, disabled: saveAllButtonDisabled, isLoading: isSavingAll, tooltip: "Save All Unsaved Tabs (Ctrl+Shift+S)" },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, onClick: () => { const currentPath = activeTabPathRef.current; if(currentPath) { setOpenedTabs(p => p.map(t=> t.path === currentPath ? {...t, content: null, originalContent: null, error: null, isLoading: false, unsavedChanges: false, isWritable: null} : t)); setTimeout(() => setActiveTabPath(currentPath), 0); } }, tooltip: "Reload Active File Content", disabled: !activeTabData || activeTabData.isLoading },
    { id: 'find', label: 'Find', icon: SearchIconLucide, onClick: () => toggleEditorWidget('find'), disabled: !activeTabData || !!activeTabData?.error, tooltip: "Find in File (Ctrl+F)" },
    { id: 'replace', label: 'Replace', icon: ReplaceIcon, onClick: () => toggleEditorWidget('replace'), disabled: !activeTabData || !isCurrentFileWritable || !!activeTabData?.error, tooltip: "Replace in File" },
    { id: 'jump', label: 'Jump', icon: SparklesIcon, onClick: () => toggleEditorWidget('jump'), disabled: !activeTabData || !!activeTabData?.error, tooltip: "Jump to Line" },
    { id: 'snapshots', label: 'Snapshots', icon: Camera, dropdown: true, disabled: !activeTabData || !!activeTabData?.error || isLoadingSnapshots, tooltip: "File Snapshots (Server-Side)" },
    { id: 'font', label: 'Font', icon: PaletteIcon, onClick: () => setTimeout(()=>toast({title:"Font Settings: Not Implemented Yet"}),0), tooltip: "Font Settings (Coming Soon)", disabled: true },
    { id: 'theme', label: 'Theme', icon: EditorSettingsIcon, onClick: () => setTimeout(()=>toast({title:"Editor Theme: Not Implemented Yet"}),0), tooltip: "Change Editor Theme (Coming Soon)", disabled: true },
    { id: 'help', label: 'Help', icon: HelpCircleIcon, onClick: () => setTimeout(()=>toast({title:"Editor Help: Not Implemented Yet"}),0), tooltip: "Editor Help (Coming Soon)", disabled: true },
  ], [activeTabData, saveButtonDisabled, handleSaveAll, saveAllButtonDisabled, isSavingAll, isLoadingSnapshots, handleSaveChanges, toast, setActiveTabPath, toggleEditorWidget, isCurrentFileWritable, globalDebugModeActive]);


  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else onOpenChange(true); }}>
      <DialogTitle id={dialogTitleId} className="sr-only">File Editor</DialogTitle>
      <DialogContent
        aria-labelledby={dialogTitleId}
        hideCloseButton={true}
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[calc(100vw-250px)] h-[calc(100vh-30px)] max-w-7xl max-h-[calc(100vh-100px)]",
          "p-0 flex flex-col border-border/50 shadow-xl rounded-lg bg-card overflow-hidden"
        )}
      >
        
        <DialogHeader className="relative flex items-center justify-between border-b border-border py-1 px-3 flex-shrink-0 h-[38px]">
          <span className="text-sm font-medium text-foreground truncate">
             {dialogTitleForHeader}
          </span>
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
                {btn.dropdown ? ( 
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 py-1" disabled={btn.disabled}>
                        {isLoadingSnapshots && btn.id === 'snapshots' ? <Loader2 className={cn("h-4 w-4 animate-spin", btn.label ? "sm:mr-1.5" : "!mr-0")} /> : <btn.icon className={cn("h-4 w-4", btn.label ? "sm:mr-1.5" : "!mr-0")} />}
                        {btn.label && <span className={cn("text-xs", "hidden sm:inline")}>{btn.label}</span>}
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
                ) : ( 
                  <Button variant="ghost" size="sm" className="h-7 px-2 py-1" onClick={btn.onClick} disabled={btn.disabled || (btn.id === 'saveAll' && btn.isLoading)}>
                     {(btn.id === 'saveAll' && btn.isLoading )
                        ? <Loader2 className={cn("h-4 w-4 animate-spin", btn.label ? "sm:mr-1.5" : "!mr-0")} />
                        : <btn.icon className={cn("h-4 w-4", btn.label ? "sm:mr-1.5" : "!mr-0")} />
                     }
                     {btn.label && <span className={cn("text-xs", "hidden sm:inline")}>{btn.label}</span>}
                  </Button>
                )}
              </TooltipTrigger> <TooltipContent><p>{btn.tooltip}</p></TooltipContent> </Tooltip> </TooltipProvider>
            ))}
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground truncate">
             {activeTabData && (
                <>
                    <span className="font-mono truncate max-w-[200px] sm:max-w-[300px] md:max-w-xs lg:max-w-sm xl:max-w-md" title={activeTabData.path}>{activeTabData.path}</span>
                </>
             )}
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
                    "pr-7" 
                  )}
                  title={tab.path}
                >
                  <span className="truncate">{tab.name}</span>
                  {tab.unsavedChanges && ( <span className="ml-1.5 text-orange-400 font-bold">*</span> )}
                  {tab.isLoading && !tab.error && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
                  {tab.error && <AlertTriangle className="ml-1.5 h-3 w-3 text-destructive" title={tab.error ?? undefined}/>}
                  <Button
                    variant="ghost" size="icon"
                    className={cn(
                      "absolute right-0.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-sm transition-opacity p-0 opacity-50 group-hover:opacity-100", 
                       activeTabPath === tab.path ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary/80" : "text-muted-foreground/70 hover:text-accent-foreground hover:bg-accent/80"
                    )}
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    aria-label={`Close tab ${tab.name}`}
                  ><FileX2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              {openedTabs.length === 0 && ( <div className="px-3 py-1.5 text-xs text-muted-foreground">No files open. Double-click a file in the tree.</div> )}
            </div>
          </ScrollArea>
        </div>

        {/* Active File Info Header (Below Tabs, Above File Tree/Editor Split) */}
         <div className="flex items-center justify-between p-1.5 border-b border-border/60 bg-muted/30 flex-shrink-0 truncate h-[34px]">
            <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFileTreeOpen(prev => !prev)}>
                    {isFileTreeOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
                </Button>
            </TooltipTrigger><TooltipContent>{isFileTreeOpen ? "Close File Tree" : "Open File Tree"}</TooltipContent></Tooltip></TooltipProvider>
            
            {/* Detailed File Info Bar */}
            {activeTabData && (
                <div className="flex items-center space-x-3 text-xs text-muted-foreground shrink-0 ml-2 truncate">
                    <span>Dir: <span className="font-mono">{activeFileDirForInfoBar}</span></span>
                    <span className="hidden sm:inline">|</span> <span className="hidden sm:inline">History: {serverSnapshots.length}</span> 
                    <span className="hidden md:inline">|</span> <span className="hidden md:inline">Space: 4</span>
                    <span className="hidden lg:inline">|</span> <span className="hidden lg:inline">Enc: UTF-8</span>
                    <span className="hidden sm:inline">|</span> <span className="capitalize hidden sm:inline">Lang: {activeFileLangForInfoBar}</span>
                    <span className="hidden sm:inline">|</span> <span className="hidden sm:inline">Lines: {lineCount}</span>
                    <span className="hidden md:inline">|</span> <span className="hidden md:inline">Chars: {charCount}</span>
                </div>
            )}
             <div className="flex items-center space-x-2 text-xs">
                {activeTabData?.unsavedChanges && <span className="text-orange-400 font-semibold">* Unsaved</span>}
                {activeTabData?.isWritable === false && <span className="text-red-400 font-semibold">(Read-only)</span>}
            </div>
        </div>


        {/* Main Content Area: File Tree and Editor Pane */}
        <div className="flex flex-1 overflow-hidden min-h-0"> 
            {isFileTreeOpen && (
              <div className="w-64 bg-muted/30 border-r border-border/60 flex flex-col flex-shrink-0 overflow-hidden">
                {/* File Tree Header */}
                <div className="p-2 border-b border-border flex items-center gap-1 flex-shrink-0">
                  <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleTreeBackClick} disabled={treeBackButtonDisabled} className="h-7 w-7">
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
                {/* File Tree Toolbar (New/Folder/Upload/Refresh) */}
                 <div className="p-1 border-b border-border flex items-center justify-around flex-shrink-0">
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTimeout(() => toast({title:"New File: Not Implemented Yet"}),0)}><FilePlus className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>New File</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTimeout(() => toast({title:"New Folder: Not Implemented Yet"}),0)}><FolderPlus className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>New Folder</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTimeout(() => toast({title:"Upload: Not Implemented Yet"}),0)}><Upload className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Upload</TooltipContent></Tooltip></TooltipProvider>
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fetchFileTreeItems(fileTreePathRef.current)} disabled={isFileTreeLoading}><RefreshCw className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Refresh Tree</TooltipContent></Tooltip></TooltipProvider>
                 </div>
                {/* File List */}
                <ScrollArea className="flex-grow p-1">
                  {isFileTreeLoading ? <div className="p-3 flex items-center justify-center text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Loading...</div>
                    : fileTreeError ? <Alert variant="destructive" className="m-2 text-xs"><FileWarning className="h-3 w-3" /><ShadcnAlertTitle className="text-xs font-semibold">Error</ShadcnAlertTitle><AlertDescription className="text-xs">{fileTreeError}</AlertDescription></Alert>
                    : <ul className="space-y-0.5"> {fileTreeItems.map((item) => ( <li key={item.name} className="flex justify-between items-center px-2 py-1 hover:bg-accent rounded-md cursor-pointer text-xs" onDoubleClick={() => item.type === 'folder' ? handleTreeFolderClick(item.name) : handleTreeFileClick(item.name)}> <div className="flex items-center space-x-2 min-w-0"> {getFileIcon(item.name, item.type)} <span className="truncate">{item.name}</span> </div> </li> ))} {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && ( <li className="px-2 py-1.5 text-xs text-muted-foreground text-center">Directory is empty.</li> )} </ul>
                  }
                </ScrollArea>
              </div>
            )}

            {/* Editor Pane */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 border-2 border-border/70 rounded-md shadow-sm m-1">
                <div className="flex-grow relative p-0 bg-background min-h-0"> 
                  {activeTabData ? (
                    <>
                      {activeTabData.isLoading && !activeTabData.error ? ( <div className="absolute inset-0 flex items-center justify-center text-sm"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading {activeTabData.name}...</div>
                      ) : activeTabData.error ? ( <Alert variant="destructive" className="m-4 absolute inset-0 flex flex-col items-center justify-center text-center"> <AlertTriangle className="h-6 w-6 mb-2" /><ShadcnAlertTitle>Error Loading File</ShadcnAlertTitle><AlertDescription>{activeTabData.error}</AlertDescription> <Button variant="outline" size="sm" className="mt-3" onClick={() => { const currentPath = activeTabPathRef.current; if (currentPath) { setOpenedTabs(prev => prev.map(t => t.path === currentPath ? {...t, content: null, originalContent: null, error: null, isLoading: false, unsavedChanges: false, isWritable: null} : t)); setTimeout(() => setActiveTabPath(currentPath), 0); } }}>Retry</Button> </Alert>
                      ) : (
                        <CodeEditor ref={editorRef} value={editorContentForActiveTab} language={editorLanguageForActiveTab} onChange={handleEditorContentChange} readOnly={activeTabData.isLoading || !isCurrentFileWritable || !!activeTabData.error} className="h-full w-full border-0 rounded-none" />
                      )}
                      
                      {activeEditorWidget === 'find' && activeTabData && !activeTabData.isLoading && !activeTabData.error && (
                        <div className="absolute top-1 right-1 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                           <div className="flex items-center justify-between gap-1">
                               <Button variant="ghost" size="icon" onClick={toggleCaseSensitiveSearch} className={cn("h-6 w-6", isCaseSensitiveSearch && "bg-accent text-accent-foreground")}><TooltipProvider><Tooltip><TooltipTrigger asChild><CaseSensitiveIcon className="h-3 w-3" /></TooltipTrigger><TooltipContent>Case Sensitive</TooltipContent></Tooltip></TooltipProvider></Button>
                               <Input id="editor-search-input" type="text" placeholder="Find..." value={searchQuery} onChange={handleSearchInputChange} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); if (e.key === 'Escape') setActiveEditorWidget(null); }} className="h-7 text-xs px-2 py-1 flex-grow"/>
                               <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setActiveEditorWidget(null)} className="h-6 w-6"><X className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Close Search</TooltipContent></Tooltip></TooltipProvider>
                           </div>
                           <div className="flex items-center justify-between gap-1 pt-0.5 flex-wrap">
                            <div className="flex gap-0.5">
                              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handlePreviousSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6"><ChevronUp className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Previous</TooltipContent></Tooltip></TooltipProvider>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={handleNextSearchMatch} disabled={searchMatches.length === 0} className="h-6 w-6"><ChevronDown className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Next</TooltipContent></Tooltip></TooltipProvider>
                            </div>
                            <span className="text-xs text-muted-foreground truncate">{searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : "No matches"}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {PRESET_SEARCH_TERMS.map((term) => ( <Button key={term} variant="outline" className="text-xs px-1.5 py-0.5 h-auto" onClick={() => handlePresetSearch(term)}>{term}</Button>))}
                          </div>
                        </div>
                      )}
                      {activeEditorWidget === 'replace' && activeTabData && !activeTabData.isLoading && !activeTabData.error && (
                        <div className="absolute top-1 right-1 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-medium px-1">Replace:</span>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setActiveEditorWidget(null)} className="h-6 w-6"><X className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Close Replace</TooltipContent></Tooltip></TooltipProvider>
                          </div>
                          <Input type="text" placeholder="Find..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-7 text-xs px-2 py-1"/>
                          <Input type="text" placeholder="Replace with..." value={replaceWithValue} onChange={(e) => setReplaceWithValue(e.target.value)} className="h-7 text-xs px-2 py-1"/>
                          <div className="flex items-center justify-between gap-1 pt-1">
                            <div className="flex gap-0.5">
                              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleReplaceNext} className="h-6 text-xs px-2">Replace</Button></TooltipTrigger><TooltipContent>Replace Next</TooltipContent></Tooltip></TooltipProvider>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={handleReplaceAll} className="h-6 text-xs px-2">All</Button></TooltipTrigger><TooltipContent>Replace All</TooltipContent></Tooltip></TooltipProvider>
                            </div>
                            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={toggleCaseSensitiveSearch} className={cn("h-6 w-6", isCaseSensitiveSearch && "bg-accent text-accent-foreground")}><CaseSensitiveIcon className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Case Sensitive</TooltipContent></Tooltip></TooltipProvider>
                          </div>
                        </div>
                      )}
                      {activeEditorWidget === 'jump' && activeTabData && !activeTabData.isLoading && !activeTabData.error && (
                         <div className="absolute top-1 right-1 bg-card border border-border rounded-md shadow-lg p-2 w-60 z-10 space-y-1.5">
                           <div className="flex items-center justify-between gap-1">
                               <span className="text-xs font-medium px-1">Jump to Line:</span>
                               <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setActiveEditorWidget(null)} className="h-6 w-6"><X className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Close Jump</TooltipContent></Tooltip></TooltipProvider>
                           </div>
                           <div className="flex gap-1">
                             <Input type="number" placeholder="Line no." value={jumpLineInput} onChange={(e) => setJumpLineInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleJumpToLine(); if (e.key === 'Escape') setActiveEditorWidget(null);}} className="h-7 text-xs px-2 py-1 flex-grow"/>
                             <Button variant="outline" size="sm" onClick={handleJumpToLine} className="h-7 text-xs px-2">Go</Button>
                           </div>
                         </div>
                      )}
                    </>
                  ) : ( <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center"><p>No file selected or content loaded.</p></div> )}
                </div>
            </div>
        </div>
        
        <DialogFooter className="p-1.5 border-t border-border/60 bg-muted/50 flex-shrink-0 text-xs text-muted-foreground text-center h-[30px]">
          © {new Date().getFullYear()} DVPanel
        </DialogFooter>

      </DialogContent>
      {isSnapshotViewerOpen && selectedSnapshotForViewer && (
        <SnapshotViewerDialog isOpen={isSnapshotViewerOpen} onOpenChange={setIsSnapshotViewerOpen} snapshot={selectedSnapshotForViewer} />
      )}
    </Dialog>
  );
}
