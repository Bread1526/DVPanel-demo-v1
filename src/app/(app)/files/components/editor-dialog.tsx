"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  isWritable: boolean | null;
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
  if (fileType === 'link') return <FileIconDefault className="h-4 w-4 text-purple-400 shrink-0" />; // Example color for symlinks
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
    case '.exe': case '.dmg': case '.app': return <FileTextIcon className="h-4 w-4 text-gray-800 shrink-0" />; // Generic for executables
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

  const [currentFileInEditorPath, setCurrentFileInEditorPathInternal] = useState<string | null>(null);
  const currentFileInEditorPathRef = useRef<string | null>(null);

  const [fileTreePath, setFileTreePathInternal] = useState<string>('/');
  const [fileTreeItems, setFileTreeItems] = useState<FileItemForTree[]>([]);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState<boolean>(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const fileTreePathRef = useRef<string>('/');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [serverSnapshots, setServerSnapshots] = useState<Snapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [globalDebugModeActive, setGlobalDebugModeActive] = useState<boolean>(false);
  const [isSnapshotViewerOpen, setIsSnapshotViewerOpen] = useState(false);
  const [selectedSnapshotForViewer, setSelectedSnapshotForViewer] = useState<Snapshot | null>(null);
  
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isCaseSensitiveSearch, setIsCaseSensitiveSearch] = useState(false);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevPosition, setPrevPosition] = useState({ x: 0, y: 0 });
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (globalDebugModeActive) {
      console.log("[EditorDialog] RENDER CYCLE", {
        isOpen, filePathToEdit, activeTabPath, openedTabsCount: openedTabs.length,
        currentFileInEditorPath, fileTreePath, fileTreeItemsCount: fileTreeItems.length, isFileTreeLoading,
      });
    }
  });
  
  // Update refs whenever their corresponding state changes
  useEffect(() => { activeTabPathRef.current = activeTabPath; }, [activeTabPath]);
  useEffect(() => { currentFileInEditorPathRef.current = currentFileInEditorPath; }, [currentFileInEditorPath]);
  useEffect(() => { fileTreePathRef.current = fileTreePath; }, [fileTreePath]);

  // Combined setter for activeTabPath and currentFileInEditorPath
  const setActiveTabPath = useCallback((newActivePath: string | null) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] setActiveTabPath called with: ${newActivePath}`);
    setActiveTabPathInternal(newActivePath);
    setCurrentFileInEditorPathInternal(newActivePath);
  }, [globalDebugModeActive]);

  const setFileTreePath = useCallback((newPath: string) => {
    const normalizedPath = path.normalize(newPath);
    if (globalDebugModeActive) console.log(`[EditorDialog] setFileTreePath called with: ${newPath}, normalized to: ${normalizedPath}`);
    setFileTreePathInternal(normalizedPath === '.' ? '/' : normalizedPath);
  }, [globalDebugModeActive]);

  const handleOpenOrActivateTab = useCallback((filePath: string, fileName: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleOpenOrActivateTab: filePath=${filePath}, fileName=${fileName}`);
    
    setOpenedTabs(prevTabs => {
      const existingTabIndex = prevTabs.findIndex(tab => tab.path === filePath);
      let newTabs;
      if (existingTabIndex !== -1) {
        // If tab exists, move it to the end (to make it active visually in a left-to-right tab list)
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
  }, [globalDebugModeActive, setActiveTabPath]);

  // Effect for initializing dialog when it opens or filePathToEdit changes
  useEffect(() => {
    if (globalDebugModeActive) console.log("[EditorDialog] Initialization useEffect - isOpen:", isOpen, "filePathToEdit:", filePathToEdit);
    
    if (isOpen) {
      loadPanelSettings().then(settingsResult => {
        setGlobalDebugModeActive(settingsResult.data?.debugMode ?? false);
      }).catch(err => console.error("Failed to load panel settings for debug mode", err));

      if (filePathToEdit) {
        const initialDir = path.dirname(filePathToEdit);
        const normalizedInitialDir = path.normalize(initialDir === '.' ? '/' : initialDir);
        
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: fileTreePath WILL BE SET to ${normalizedInitialDir} from filePathToEdit ${filePathToEdit}`);
        setFileTreePath(normalizedInitialDir);
        
        if (globalDebugModeActive) console.log(`[EditorDialog] Initializing: Opening/Activating tab for ${filePathToEdit}`);
        handleOpenOrActivateTab(filePathToEdit, path.basename(filePathToEdit));
      } else {
        // If no specific file, open with empty state or default to root for file tree
        setOpenedTabs([]);
        setActiveTabPath(null);
        setFileTreePath('/');
        if (globalDebugModeActive) console.log("[EditorDialog] Initializing: No filePathToEdit, setting tree to root.");
      }
      
      // Reset search state
      setIsSearchWidgetOpen(false);
      setSearchQuery("");
      setSearchMatches([]);
      setCurrentMatchIndex(-1);

      // Reset dialog position if not maximized
      if (!isMaximized) {
        const defaultWidth = Math.min(window.innerWidth * 0.9, 1200); // Example width
        const defaultHeight = Math.min(window.innerHeight * 0.85, 900); // Example height
        setPosition({
          x: Math.max(0, window.innerWidth / 2 - defaultWidth / 2),
          y: Math.max(0, window.innerHeight / 2 - defaultHeight / 2)
        });
      }
    } else { // When dialog closes
      setOpenedTabs([]); // Clear opened tabs
      setActiveTabPath(null);
      setServerSnapshots([]); // Clear snapshots
      setFileTreePath('/'); // Reset file tree path
      setFileTreeItems([]); // Clear file tree items
      if (globalDebugModeActive) console.log("[EditorDialog] Dialog closing, states reset.");
    }
  }, [isOpen, filePathToEdit, isMaximized, handleOpenOrActivateTab, globalDebugModeActive, setFileTreePath, setActiveTabPath]);


  // Fetch file tree items when fileTreePath or isOpen changes
  const fetchFileTreeItems = useCallback(async (pathToDisplay: string) => {
    if (!isOpen) {
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Dialog closed, aborting fetch for ${pathToDisplay}`);
      return;
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems CALLED for path: ${pathToDisplay}`);
    
    setIsFileTreeLoading(true);
    
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
      
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems API response for ${pathToDisplay}:`, data);
      setFileTreeItems(Array.isArray(data.files) ? data.files : []);
      setFileTreeError(null); 

      const normalizedServerPath = path.normalize(data.path || pathToDisplay);
      if (normalizedServerPath !== fileTreePathRef.current) {
          if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Server path ${normalizedServerPath} differs from current ref ${fileTreePathRef.current}. Syncing internal state for tree path if different from current state value.`);
          setFileTreePath(normalizedServerPath);
      }

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
      } else {
        if (globalDebugModeActive) console.log(`[EditorDialog] fetchFileTreeItems: Stale fetch for ${pathToDisplay} finished, but current path is ${fileTreePathRef.current}. Loading state might be handled by another fetch.`);
      }
    }
  }, [isOpen, globalDebugModeActive, setFileTreePath]);

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


  // Fetch server-side snapshots for the active file
  const fetchSnapshots = useCallback(async (currentFilePath: string) => {
    if (!currentFilePath || !isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots called for: ${currentFilePath}`);
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots?filePath=${encodeURIComponent(currentFilePath)}`);
      if (!response.ok) { 
        const errText = await response.text();
        const errData = errText ? JSON.parse(errText) : {error: "Failed to fetch snapshots"};
        throw new Error(errData.error || "Failed to fetch snapshots"); 
      }
      const data = await response.json();
      const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
      if (globalDebugModeActive) console.log(`[EditorDialog] fetchSnapshots received ${snapshots.length} snapshots for ${currentFilePath}`);
      if (currentFileInEditorPathRef.current === currentFilePath) {
        setServerSnapshots(snapshots);
      }
    } catch (e: any) { 
      if (globalDebugModeActive) console.error("[EditorDialog] Error fetching snapshots:", e.message);
      if (currentFileInEditorPathRef.current === currentFilePath) {
        setSnapshotError(e.message || "Error fetching snapshots");
      }
    } finally { 
      if (currentFileInEditorPathRef.current === currentFilePath) {
        setIsLoadingSnapshots(false); 
      }
    }
  }, [isOpen, globalDebugModeActive]);

  // Effect for loading content for the active tab or fetching snapshots
  useEffect(() => {
    if (!activeTabPath || !isOpen) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath, openedTabs, isOpen]: Active tab path is ${activeTabPath}`);

    const activeTabIndex = openedTabs.findIndex(tab => tab.path === activeTabPath);
    if (activeTabIndex === -1) {
      if (globalDebugModeActive) console.warn(`[EditorDialog] useEffect[activeTabPath]: Active tab ${activeTabPath} not found in openedTabs. This shouldn't happen.`);
      return;
    }

    const activeTabInfo = openedTabs[activeTabIndex];

    if (activeTabInfo.content === null && activeTabInfo.isLoading) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Fetching content for ${activeTabPath}`);
      
      fetch(`/api/panel-daemon/file?path=${encodeURIComponent(activeTabPath)}&view=true`)
        .then(async response => { 
            if (!response.ok) {
                const errText = await response.text();
                const errData = errText ? JSON.parse(errText) : {error: `Failed to load file. Status: ${response.status}`};
                throw new Error(errData.error || `Failed to load file. Status: ${response.status}`);
            }
            return response.json(); 
        })
        .then(data => {
          // Critical: Check if the tab is still active before updating
          if (activeTabPathRef.current === activeTabPath) { 
            if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content Loaded for ${activeTabPath}: writable=${data.writable}, content length=${data.content?.length}`);
            setOpenedTabs(prevTabs => prevTabs.map(t => 
              t.path === activeTabPath ? { 
                ...t, 
                content: data.content, 
                originalContent: data.content, // Set original content on load
                isWritable: data.writable, 
                isLoading: false, 
                unsavedChanges: false, 
                error: null
              } : t
            ));
            fetchSnapshots(activeTabPath); // Fetch snapshots after content is loaded
          } else { 
             if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Stale content received for ${activeTabPath}, current is ${activeTabPathRef.current}. Not updating.`);
          }
        })
        .catch(e => { 
          console.error(`[EditorDialog] useEffect[activeTabPath]: Error fetching content for ${activeTabPath}`, e.message);
          if (activeTabPathRef.current === activeTabPath) {
            setOpenedTabs(prevTabs => prevTabs.map(t => 
              t.path === activeTabPath ? { ...t, isLoading: false, error: e.message || "Failed to load content." } : t
            ));
          }
        });
    } else if (activeTabInfo.content !== null) {
      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content for ${activeTabPath} already loaded. Ensuring snapshots are fetched.`);
      fetchSnapshots(activeTabPath); // Ensure snapshots are fetched if content is already there
    }
  }, [activeTabPath, openedTabs, isOpen, globalDebugModeActive, fetchSnapshots]);
  
  const handleCreateSnapshot = useCallback(async () => {
    const activeTab = openedTabs.find(tab => tab.path === currentFileInEditorPathRef.current);
    if (!activeTab || activeTab.content === null) { 
        toast({ title: "Error", description: "No active file or content to snapshot.", variant: "destructive" });
        return; 
    }
    if (globalDebugModeActive) console.log("[EditorDialog] handleCreateSnapshot called for", activeTab.path);
    setIsCreatingSnapshot(true); setSnapshotError(null);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: activeTab.path, content: activeTab.content, language: activeTab.language }),
      });
      const result = await response.json();
      if (!response.ok) { 
          throw new Error(result.error || result.details || "Failed to create snapshot on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Created', description: result.message || `Snapshot for ${activeTab.name} created.` }),0);
      if(Array.isArray(result.snapshots)) {
        setServerSnapshots(result.snapshots);
      } else {
        fetchSnapshots(activeTab.path); 
      }
    } catch (e: any) { 
        if (globalDebugModeActive) console.error("[EditorDialog] Error creating snapshot:", e.message);
        setSnapshotError(e.message || "Error creating snapshot");
        setTimeout(() => toast({ title: "Snapshot Error", description: e.message, variant: "destructive"}), 0);
    } finally { setIsCreatingSnapshot(false); }
  }, [openedTabs, globalDebugModeActive, toast, fetchSnapshots]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    if (!currentFileInEditorPathRef.current) return;
    if (globalDebugModeActive) console.log(`[EditorDialog] handleEditorContentChange for ${currentFileInEditorPathRef.current}. New length: ${newContent.length}`);
    setOpenedTabs(prevTabs => prevTabs.map(tab => 
      tab.path === currentFileInEditorPathRef.current 
        ? { ...tab, content: newContent, unsavedChanges: newContent !== tab.originalContent } 
        : tab
    ));
  }, [globalDebugModeActive]);

  const handleSaveChanges = useCallback(async () => {
    const activeTabForSave = openedTabs.find(tab => tab.path === currentFileInEditorPathRef.current);
    if (!activeTabForSave || activeTabForSave.isWritable === false || activeTabForSave.content === null) { 
        setTimeout(() => toast({ title: "Cannot Save", description: "File is not writable, has no content, or no file is active.", variant: "destructive"}), 0);
        return; 
    }
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSaveChanges initiated for ${activeTabForSave.path}. Unsaved: ${activeTabForSave.unsavedChanges}`);
    
    if (activeTabForSave.unsavedChanges) { 
      await handleCreateSnapshot(); 
    } 
    setIsSaving(true);
    try {
      const response = await fetch(`/api/panel-daemon/file`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeTabForSave.path, content: activeTabForSave.content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || 'Failed to save file.');
      
      setTimeout(() => toast({ title: 'Success', description: result.message || `File ${activeTabForSave.name} saved.` }),0);
      setOpenedTabs(prevTabs => prevTabs.map(tab => 
        tab.path === activeTabForSave.path 
          ? { ...tab, originalContent: tab.content, unsavedChanges: false, error: null } 
          : tab
      ));
    } catch (e: any) { 
        if (globalDebugModeActive) console.error("[EditorDialog] Error saving file:", e.message);
        setTimeout(() => toast({ title: "Save Error", description: e.message, variant: "destructive"}), 0);
        setOpenedTabs(prevTabs => prevTabs.map(tab => tab.path === activeTabForSave.path ? { ...tab, error: e.message } : tab));
    } finally { setIsSaving(false); }
  }, [openedTabs, globalDebugModeActive, toast, handleCreateSnapshot]);

  // Effect for keyboard shortcuts (Save, Find)
  useEffect(() => {
    const activeTabForShortcut = openedTabs.find(tab => tab.path === currentFileInEditorPathRef.current);
    const canSave = isOpen && !isSaving && activeTabForShortcut && (activeTabForShortcut.isWritable !== false) && (activeTabForShortcut.unsavedChanges || globalDebugModeActive);
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's' && canSave) {
        event.preventDefault(); // Prevent browser save
        handleSaveChanges();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && isOpen) {
        event.preventDefault();
        setIsSearchWidgetOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSaving, handleSaveChanges, openedTabs, globalDebugModeActive]);

  const handleTabClose = useCallback((tabToClosePath: string) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleTabClose for ${tabToClosePath}`);
    setOpenedTabs(prevTabs => {
      const updatedTabs = prevTabs.filter(tab => tab.path !== tabToClosePath);
      if (updatedTabs.length === 0) {
        setActiveTabPath(null);
        return updatedTabs;
      }
      const currentIndex = prevTabs.findIndex(tab => tab.path === tabToClosePath);
      const newActiveTabIndex = Math.min(currentIndex, updatedTabs.length - 1);
      setActiveTabPath(updatedTabs[newActiveTabIndex].path);
      return updatedTabs;
    });
  }, [globalDebugModeActive, setActiveTabPath]);

  const handleFileTreeItemClick = useCallback((itemPath: string, itemType: FileItemForTree['type']) => {
    if (itemType === 'folder') {
      setFileTreePath(itemPath);
    } else if (itemType === 'file') {
      handleOpenOrActivateTab(itemPath, path.basename(itemPath));
    }
  }, [handleOpenOrActivateTab, setFileTreePath]);

  const handleSnapshotSelect = (snapshot: Snapshot) => {
    if (globalDebugModeActive) console.log(`[EditorDialog] handleSnapshotSelect for snapshot ${snapshot.id}`);
    setSelectedSnapshotForViewer(snapshot);
    setIsSnapshotViewerOpen(true);
  };

  const handleSnapshotLock = useCallback(async (snapshotId: string, isCurrentlyLocked: boolean) => {
    const activeTabForLock = openedTabs.find(tab => tab.path === currentFileInEditorPathRef.current);
    if (!activeTabForLock) {
      setTimeout(() => toast({ title: "Error", description: "No active file to lock snapshot.", variant: "destructive" }), 0);
      return;
    }

    if (globalDebugModeActive) console.log(`[EditorDialog] handleSnapshotLock (ID=${snapshotId}) called for ${activeTabForLock.path}. Currently locked: ${isCurrentlyLocked}`);

    try {
      const response = await fetch(`/api/panel-daemon/snapshots/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: snapshotId, filePath: activeTabForLock.path, lock: !isCurrentlyLocked }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || "Failed to lock/unlock snapshot on server.");
      }

      setTimeout(() => toast({
        title: 'Snapshot Lock Updated',
        description: result.message || `Snapshot ${snapshotId} lock updated.`,
      }), 0);

      setServerSnapshots(prevSnapshots =>
        prevSnapshots.map(snapshot =>
          snapshot.id === snapshotId ? { ...snapshot, isLocked: !isCurrentlyLocked } : snapshot
        )
      );
    } catch (e: any) {
      if (globalDebugModeActive) console.error("[EditorDialog] Error updating snapshot lock:", e.message);
      setTimeout(() => toast({ title: "Snapshot Lock Error", description: e.message, variant: "destructive" }), 0);
    }
  }, [openedTabs, globalDebugModeActive, toast]);

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const activeTabForDelete = openedTabs.find(tab => tab.path === currentFileInEditorPathRef.current);
    if (!activeTabForDelete) {
        setTimeout(() => toast({ title: "Error", description: "No active file to delete snapshot from.", variant: "destructive" }), 0);
        return;
    }

    if (globalDebugModeActive) console.log(`[EditorDialog] handleDeleteSnapshot called for snapshot ID ${snapshotId} in ${activeTabForDelete.path}`);
    try {
      const response = await fetch(`/api/panel-daemon/snapshots`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: snapshotId, filePath: activeTabForDelete.path }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || "Failed to delete snapshot on server.");
      }
      setTimeout(() => toast({ title: 'Snapshot Deleted', description: result.message || `Snapshot ${snapshotId} deleted.` }), 0);

      setServerSnapshots(prevSnapshots => prevSnapshots.filter(snapshot => snapshot.id !== snapshotId));
    } catch (e: any) {
      if (globalDebugModeActive) console.error("[EditorDialog] Error deleting snapshot:", e.message);
      setTimeout(() => toast({ title: "Snapshot Delete Error", description: e.message, variant: "destructive" }), 0);
    }
  }, [openedTabs, globalDebugModeActive, toast]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentMatchIndex(-1); // Reset current match index when search query changes
  };

  const findNextMatch = () => {
    if (!editorRef.current || !editorRef.current.view) return;

    const editorView = editorRef.current.view;
    const searchTerm = searchQuery;

    if (!searchTerm) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    // Collect All Matches
    let matches: Array<{ from: number; to: number }> = [];
    let cursor = new SearchCursor(editorView.state, searchTerm, { caseSensitive: isCaseSensitiveSearch });
    while (cursor.next()) {
      matches.push({ from: cursor.value.from, to: cursor.value.to });
    }
    setSearchMatches(matches);

    if (matches.length === 0) {
      setCurrentMatchIndex(-1);
      toast({ title: "Search", description: `No matches found for "${searchTerm}"`, duration: 2000 });
      return;
    }

    // Determine Next Match Index
    let nextIndex = 0;
    if (currentMatchIndex !== -1) {
      nextIndex = (currentMatchIndex + 1) % matches.length;
    }
    setCurrentMatchIndex(nextIndex);

    // Highlight Next Match
    const nextMatch = matches[nextIndex];
    editorView.dispatch({
      selection: EditorSelection.range(nextMatch.from, nextMatch.to),
      scrollIntoView: true,
    });
    editorView.focus();
  };

  const findPreviousMatch = () => {
    if (!editorRef.current || !editorRef.current.view) return;

    const editorView = editorRef.current.view;
    const searchTerm = searchQuery;

    if (!searchTerm) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    // Collect All Matches
    let matches: Array<{ from: number; to: number }> = [];
    let cursor = new SearchCursor(editorView.state, searchTerm, { caseSensitive: isCaseSensitiveSearch });
    while (cursor.next()) {
      matches.push({ from: cursor.value.from, to: cursor.value.to });
    }
    setSearchMatches(matches);

    if (matches.length === 0) {
      setCurrentMatchIndex(-1);
      toast({ title: "Search", description: `No matches found for "${searchTerm}"`, duration: 2000 });
      return;
    }

    // Determine Previous Match Index
    let previousIndex = matches.length - 1;
    if (currentMatchIndex !== -1) {
      previousIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    }
    setCurrentMatchIndex(previousIndex);

    // Highlight Previous Match
    const previousMatch = matches[previousIndex];
    editorView.dispatch({
      selection: EditorSelection.range(previousMatch.from, previousMatch.to),
      scrollIntoView: true,
    });
    editorView.focus();
  };

  const toggleCaseSensitiveSearch = () => {
    setIsCaseSensitiveSearch(prev => !prev);
  };

  const handleMaximize = () => {
    if (isMaximized) {
      setPosition(prevPosition);
    } else {
      setPrevPosition(position);
      setPosition({ x: 0, y: 0 }); // Set to top-left corner
    }
    setIsMaximized(!isMaximized);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        style={{
          width: isMaximized ? '100vw' : 'auto',
          height: isMaximized ? '100vh' : 'auto',
          maxWidth: isMaximized ? '100vw' : '1200px', // Adjust max width as needed
          maxHeight: isMaximized ? '100vh' : '900px', // Adjust max height as needed
          position: 'absolute',
          left: isMaximized ? 0 : position.x,
          top: isMaximized ? 0 : position.y,
          transform: 'none',
          margin: '0px',
        }}
        className={cn("p-0 border-0 shadow-xl overflow-hidden bg-secondary text-foreground", isMaximized ? 'rounded-none' : 'rounded-lg')}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <DialogHeader
          className="relative flex items-center justify-between border-b border-border p-4"
          style={{ cursor: 'move' }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex-1 flex items-center">
            <DialogTitle className="text-lg font-semibold flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
              Editor
            </DialogTitle>
          </div>
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMaximize}
                  >
                    {isMaximized ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                    <span className="sr-only">{isMaximized ? "Shrink" : "Expand"}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isMaximized ? "Shrink" : "Expand"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex h-full">
          {/* Left Panel: File Tree */}
          <div className="w-64 border-r border-border bg-secondary/90 backdrop-blur-sm flex-shrink-0 relative overflow-hidden">
            <div className="p-3 border-b border-border flex items-center">
              <Button variant="ghost" size="sm" onClick={() => setFileTreePath(path.dirname(fileTreePathRef.current))}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <span className="text-sm font-medium truncate ml-auto">{fileTreePathRef.current}</span>
            </div>

            <ScrollArea className="h-[calc(100vh-100px)]">
              {isFileTreeLoading ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading...</span>
                </div>
              ) : fileTreeError ? (
                <Alert variant="destructive">
                  <FileWarning className="h-4 w-4" />
                  <ShadcnAlertTitle>Error</ShadcnAlertTitle>
                  <AlertDescription>{fileTreeError}</AlertDescription>
                </Alert>
              ) : (
                <ul className="py-2">
                  {fileTreeItems.map((item) => (
                    <li key={item.name} className="px-3 py-1 hover:bg-accent cursor-pointer" onClick={() => handleFileTreeItemClick(path.join(fileTreePathRef.current, item.name), item.type)}>
                      <div className="flex items-center space-x-2">
                        {getFileIcon(item.name, item.type)}
                        <span className="text-sm truncate">{item.name}</span>
                      </div>
                    </li>
                  ))}
                  {fileTreeItems.length === 0 && !isFileTreeLoading && !fileTreeError && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                      No items in this directory.
                    </li>
                  )}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Right Panel: Editor and Tabs */}
          <div className="flex-1 flex flex-col h-full">
            {/* Tab Bar */}
            <div className="flex items-center p-2 border-b border-border bg-secondary/90 backdrop-blur-sm">
              <ScrollArea className="w-full">
                <div className="flex items-center">
                  {openedTabs.map((tab) => {
                    const isActive = tab.path === activeTabPath;
                    return (
                      <Button
                        key={tab.path}
                        variant={isActive ? "default" : "ghost"}
                        size="sm"
                        className="relative flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 data-[state=active]:bg-secondary data-[state=active]:text-foreground"
                        onClick={() => setActiveTabPath(tab.path)}
                      >
                        {tab.name}
                        {tab.unsavedChanges && <span className="ml-1 text-red-500">*</span>}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1.5 top-1.5 h-4 w-4 rounded-sm opacity-0 transition-opacity hover:bg-primary/10 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTabClose(tab.path);
                          }}
                        >
                          <X className="h-3 w-3" />
                          <span className="sr-only">Close</span>
                        </Button>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Editor Area */}
            <div className="flex-1 relative">
              {activeTabPath && (
                <>
                  {openedTabs.map((tab) => (
                    tab.path === activeTabPath && (
                      <div key={tab.path} className="absolute inset-0 flex flex-col">
                        {tab.isLoading ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="ml-2">Loading {tab.name}...</span>
                          </div>
                        ) : tab.error ? (
                          <div className="p-4 h-full flex flex-col">
                            <Alert variant="destructive">
                              <AlertTriangle className="h-4 w-4" />
                              <ShadcnAlertTitle>Error</ShadcnAlertTitle>
                              <AlertDescription>{tab.error}</AlertDescription>
                            </Alert>
                            <div className="mt-4 flex justify-end">
                              <Button onClick={() => {
                                setOpenedTabs(prevTabs => prevTabs.map(t =>
                                  t.path === activeTabPath ? { ...t, isLoading: true, error: null } : t
                                ));
                                fetch(`/api/panel-daemon/file?path=${encodeURIComponent(activeTabPath)}&view=true`)
                                  .then(async response => {
                                    if (!response.ok) {
                                      const errText = await response.text();
                                      const errData = errText ? JSON.parse(errText) : { error: `Failed to load file. Status: ${response.status}` };
                                      throw new Error(errData.error || `Failed to load file. Status: ${response.status}`);
                                    }
                                    return response.json();
                                  })
                                  .then(data => {
                                    // Critical: Check if the tab is still active before updating
                                    if (activeTabPathRef.current === activeTabPath) {
                                      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Content Loaded for ${activeTabPath}: writable=${data.writable}, content length=${data.content?.length}`);
                                      setOpenedTabs(prevTabs => prevTabs.map(t =>
                                        t.path === activeTabPath ? {
                                          ...t,
                                          content: data.content,
                                          originalContent: data.content, // Set original content on load
                                          isWritable: data.writable,
                                          isLoading: false,
                                          unsavedChanges: false,
                                          error: null
                                        } : t
                                      ));
                                    } else {
                                      if (globalDebugModeActive) console.log(`[EditorDialog] useEffect[activeTabPath]: Stale content received for ${activeTabPath}, current is ${activeTabPathRef.current}. Not updating.`);
                                    }
                                  })
                                  .catch(e => {
                                    console.error(`[EditorDialog] useEffect[activeTabPath]: Error fetching content for ${activeTabPath}`, e.message);
                                    if (activeTabPathRef.current === activeTabPath) {
                                      setOpenedTabs(prevTabs => prevTabs.map(t =>
                                        t.path === activeTabPath ? { ...t, isLoading: false, error: e.message || "Failed to load content." } : t
                                      ));
                                    }
                                  });
                              }}>Retry</Button>
                            </div>
                          </div>
                        ) : (
                          <CodeEditor
                            ref={editorRef}
                            value={tab.content}
                            language={tab.language}
                            onChange={handleEditorContentChange}
                            readOnly={tab.isWritable === false}
                            padding="1rem"
                            style={{
                              fontSize: 14,
                            }}
                          />
                        )}
                      </div>
                    )
                  ))}
                </>
              )}

              {!activeTabPath && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a file to start editing.
                </div>
              )}
            </div>

            {/* Bottom Bar: Actions */}
            <div className="flex items-center justify-between p-2 border-t border-border bg-secondary/90 backdrop-blur-sm">
              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!activeTabPath || openedTabs.find(tab => tab.path === activeTabPath)?.isWritable === false}
                        onClick={handleSaveChanges}
                        isLoading={isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Save Current File
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!activeTabPath}
                        onClick={handleCreateSnapshot}
                        isLoading={isCreatingSnapshot}
                      >
                        {isCreatingSnapshot ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Camera className="mr-2 h-4 w-4" />
                            Snapshot
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Create Snapshot
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      Snapshots
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Snapshots</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {isLoadingSnapshots ? (
                      <DropdownMenuItem className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </DropdownMenuItem>
                    ) : snapshotError ? (
                      <DropdownMenuItem className="text-destructive">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {snapshotError}
                      </DropdownMenuItem>
                    ) : serverSnapshots.length === 0 ? (
                      <DropdownMenuItem>No snapshots available</DropdownMenuItem>
                    ) : (
                      serverSnapshots.map((snapshot) => (
                        <DropdownMenuItem key={snapshot.id} className="flex justify-between items-center">
                          <div className="flex flex-col items-start">
                            {formatDistanceToNowStrict(new Date(snapshot.timestamp), {
                              addSuffix: true,
                            })}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(snapshot.timestamp), 'MMM dd, yyyy h:mm a')}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    handleSnapshotSelect(snapshot);
                                  }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View Snapshot</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    handleSnapshotLock(snapshot.id, snapshot.isLocked === true);
                                  }}>
                                    {snapshot.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{snapshot.isLocked ? "Unlock Snapshot" : "Lock Snapshot"}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSnapshot(snapshot.id);
                                  }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete Snapshot</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      Search
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Search Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsSearchWidgetOpen(true)}>
                      <SearchIconLucide className="mr-2 h-4 w-4" />
                      Open Search Widget
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={findNextMatch}>
                      Find Next
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
        {/* Search Widget */}
        {isSearchWidgetOpen && (
          <div className="absolute top-12 right-4 bg-secondary border border-border rounded-md shadow-md p-4 w-80 z-50">
            <div className="flex items-center mb-2">
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={handleSearchInputChange}
                className="mr-2"
              />
              <Button variant="outline" size="icon" onClick={() => setIsSearchWidgetOpen(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={findPreviousMatch}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={findNextMatch}>
                Next
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={toggleCaseSensitiveSearch}>
                      <CaseSensitive className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Case Sensitivity</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {searchMatches.length > 0 ? `Match ${currentMatchIndex + 1} of ${searchMatches.length}` : "No matches"}
            </div>
            <div className="mt-2">
              {PRESET_SEARCH_TERMS.map((term) => (
                <Button
                  key={term}
                  variant="ghost"
                  size="sm"
                  className="mr-1 mb-1"
                  onClick={() => {
                    setSearchQuery(term);
                    setIsSearchWidgetOpen(true);
                    setTimeout(() => {
                      findNextMatch(); // Trigger search after setting the query
                    }, 0);
                  }}
                >
                  {term}
                </Button>
              ))}
            </div>
          </div>
        )}
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
