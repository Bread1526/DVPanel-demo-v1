
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  MoreHorizontal, Folder, File as FileIcon, Upload, Download, Edit3, Trash2, KeyRound, Search, ArrowLeft, Loader2, AlertTriangle, Save, X,
  FileCode2, FileJson, FileText, ImageIcon, Archive, Shell, FileTerminal, AudioWaveform, VideoIcon, Database, List, Shield, Github, Settings2, ServerCog
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import CodeEditor from '@/components/ui/code-editor';
import { useToast } from "@/hooks/use-toast";
import path from 'path-browserify';
import { format } from 'date-fns';
import PermissionsDialog from './components/permissions-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface FileItem {
  name: string;
  type: 'folder' | 'file' | 'unknown';
  size?: number | null;
  modified?: string | null;
  permissions?: string | null;
  octalPermissions?: string | null;
}

interface OpenedFile {
  path: string; // Full path
  name: string;
  content: string; // Current content in editor
  originalContent: string; // Content as loaded from server or last save
  language: string;
  unsavedChanges: boolean;
  needsFetching?: boolean; // Flag to indicate if content needs to be fetched
}

const DAEMON_API_BASE_PATH = '/api/panel-daemon';

function formatBytes(bytes?: number | null, decimals = 2) {
  if (bytes === null || bytes === undefined || !+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileIcon(filename: string, fileType: FileItem['type']): React.ReactNode {
  if (fileType === 'folder') return <Folder className="h-5 w-5 text-primary" />;
  if (fileType === 'unknown') return <FileIcon className="h-5 w-5 text-muted-foreground" />;

  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'html': case 'htm': return <FileCode2 className="h-5 w-5 text-orange-500" />;
    case 'css': case 'scss': case 'sass': return <FileCode2 className="h-5 w-5 text-blue-500" />;
    case 'js': case 'jsx': return <FileCode2 className="h-5 w-5 text-yellow-500" />;
    case 'ts': case 'tsx': return <FileCode2 className="h-5 w-5 text-sky-500" />;
    case 'json': return <FileJson className="h-5 w-5 text-yellow-600" />;
    case 'yaml': case 'yml': return <ServerCog className="h-5 w-5 text-indigo-400" />;
    case 'txt': case 'md': case 'log': return <FileText className="h-5 w-5 text-gray-500" />;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'ico': return <ImageIcon className="h-5 w-5 text-purple-500" />;
    case 'zip': case 'tar': case 'gz': case 'rar': case '7z': return <Archive className="h-5 w-5 text-amber-700" />;
    case 'sh': case 'bash': return <Shell className="h-5 w-5 text-green-600" />;
    case 'bat': case 'cmd': return <FileTerminal className="h-5 w-5 text-gray-700" />;
    case 'mp3': case 'wav': case 'ogg': return <AudioWaveform className="h-5 w-5 text-pink-500" />;
    case 'mp4': case 'mov': case 'avi': case 'mkv': return <VideoIcon className="h-5 w-5 text-red-500" />;
    case 'db': case 'sqlite': case 'sql': return <Database className="h-5 w-5 text-indigo-500" />;
    case 'csv': case 'xls': case 'xlsx': return <List className="h-5 w-5 text-green-700" />;
    case 'exe': case 'dmg': case 'app': return <Settings2 className="h-5 w-5 text-gray-800" />;
    case 'pem': case 'crt': case 'key': return <Shield className="h-5 w-5 text-teal-500" />;
    case 'gitignore': case 'gitattributes': case 'gitmodules': return <Github className="h-5 w-5 text-neutral-700" />;
    default: return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  }
}

function getLanguageFromFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'html': case 'htm': return 'html';
    case 'css': case 'scss': return 'css';
    case 'json': return 'json';
    case 'yaml': case 'yml': return 'yaml';
    case 'md': return 'markdown';
    case 'sh': case 'bash': return 'shell';
    case 'py': return 'python';
    default: return 'plaintext';
  }
}

export default function FilesPage() {
  console.log("[FilesPage] Component RENDER start");
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Tabbed editor state
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const activeFilePathRef = useRef<string | null>(null);

  // Editor specific state
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [permissionDialogTargetPath, setPermissionDialogTargetPath] = useState<string>("");
  const [permissionDialogCurrentRwxPerms, setPermissionDialogCurrentRwxPerms] = useState<string>("");
  const [permissionDialogCurrentOctalPerms, setPermissionDialogCurrentOctalPerms] = useState<string>("");

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  const fetchFiles = useCallback(async (pathToFetch: string) => {
    console.log("[FilesPage] fetchFiles CALLED for path:", pathToFetch);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/files?path=${encodeURIComponent(pathToFetch)}`);
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errData = await response.json();
          errorMsg = errData.error || errData.details || errorMsg;
        } catch (parseError) {
           errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      console.log("[FilesPage] fetchFiles RESPONSE for path:", pathToFetch, "DATA:", data);
      if (data && Array.isArray(data.files)) {
        setFiles(data.files.map((f: any) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          modified: f.modified,
          permissions: f.permissions,
          octalPermissions: f.octalPermissions,
        })));
        setCurrentPath(data.path || pathToFetch);
      } else {
        setFiles([]);
        setCurrentPath(data.path || pathToFetch);
        if (!Array.isArray(data.files)) console.warn("API did not return a 'files' array. Response:", data);
      }
    } catch (e: any) {
      console.error("Error fetching files:", e);
      const errorMessage = e.message || "An unknown error occurred while fetching files.";
      setError(errorMessage);
      setFiles([]);
      toast({ title: "File Manager Error", description: `Could not fetch files: ${errorMessage}.`, variant: "destructive" });
    } finally {
      setIsLoading(false);
      console.log("[FilesPage] fetchFiles FINISHED for path:", pathToFetch);
    }
  }, [toast]);

  useEffect(() => {
    console.log("[FilesPage] useEffect for currentPath, calling fetchFiles with currentPath:", currentPath);
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  const handleFolderClick = useCallback((folderName: string) => {
    const newPath = path.join(currentPath, folderName);
    console.log("[FilesPage] handleFolderClick:", folderName, "New path will be:", newPath.replace(/\\/g, '/'));
    setCurrentPath(newPath.replace(/\\/g, '/'));
  }, [currentPath]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const segments = currentPath.split('/').filter(Boolean);
    let newPath = '/';
    if (index >= 0) {
      newPath += segments.slice(0, index + 1).join('/');
    }
    console.log("[FilesPage] handleBreadcrumbClick: index", index, "New path:", newPath.replace(/\\/g, '/'));
    setCurrentPath(newPath.replace(/\\/g, '/'));
  }, [currentPath]);

  const getBreadcrumbSegments = useMemo(() => {
    if (currentPath === '/') return [{ name: 'Root', path: '/' }];
    const segments = currentPath.split('/').filter(Boolean);
    return [{ name: 'Root', path: '/' }, ...segments.map((segment, index) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/'),
    }))];
  }, [currentPath]);

  const handleOpenAndActivateFile = useCallback((fileItem: FileItem) => {
    console.log("[FilesPage] handleOpenAndActivateFile CALLED for fileItem:", fileItem.name, "Type:", fileItem.type);
    if (fileItem.type === 'folder') {
      handleFolderClick(fileItem.name);
      return;
    }

    const fullPath = path.join(currentPath, fileItem.name).replace(/\\/g, '/');
    console.log("[FilesPage] handleOpenAndActivateFile: Full path to open:", fullPath);

    setOpenedFiles(prev => {
      const existingFileIndex = prev.findIndex(f => f.path === fullPath);
      let newOpenedFiles = [...prev];

      if (existingFileIndex !== -1) {
        console.log("[FilesPage] handleOpenAndActivateFile: File already in openedFiles. Moving to end:", fullPath);
        const existingFile = newOpenedFiles.splice(existingFileIndex, 1)[0];
        newOpenedFiles.push(existingFile); // Move to end
      } else {
        console.log("[FilesPage] handleOpenAndActivateFile: File not in openedFiles. Adding:", fullPath);
        newOpenedFiles.push({
          path: fullPath,
          name: fileItem.name,
          content: "", 
          originalContent: "", 
          language: getLanguageFromFilename(fileItem.name),
          unsavedChanges: false,
          needsFetching: true, // Mark for fetching
        });
      }
      return newOpenedFiles;
    });
    console.log("[FilesPage] handleOpenAndActivateFile: Calling setActiveFilePath with:", fullPath);
    setActiveFilePath(fullPath);
  }, [currentPath, handleFolderClick]);
  
  const handleTabActivation = useCallback((filePath: string) => {
    console.log("[FilesPage] handleTabActivation CALLED for filePath:", filePath);
    setActiveFilePath(filePath);
    setOpenedFiles(prev => {
        const fileIndex = prev.findIndex(f => f.path === filePath);
        if (fileIndex === -1) return prev; // Should not happen
        const fileToActivate = prev[fileIndex];
        const restOfFiles = prev.filter(f => f.path !== filePath);
        return [...restOfFiles, fileToActivate]; // Move to end (most recently used)
    });
  }, []);

  const derivedEditorContent = useMemo(() => {
    if (!activeFilePath) return "";
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    const content = activeFile ? activeFile.content : "";
    console.log("[FilesPage] useMemo editorContent: activeFilePath='", activeFilePath, "', found content length=", content.length);
    return content;
  }, [activeFilePath, openedFiles]);

  const derivedEditorLanguage = useMemo(() => {
    if (!activeFilePath) return "plaintext";
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    return activeFile ? activeFile.language : "plaintext";
  }, [activeFilePath, openedFiles]);

  useEffect(() => {
    console.log("[FilesPage] useEffect[activeFilePath] START. Active path:", activeFilePath);
    if (!activeFilePath) {
      setEditorError(null);
      setIsEditorLoading(false);
      console.log("[FilesPage] useEffect[activeFilePath]: No active file, clearing editor states.");
      return;
    }

    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    if (!activeFile) {
      console.error("[FilesPage] useEffect[activeFilePath]: Active file data not found in openedFiles for path:", activeFilePath);
      setEditorError("Error: Active file data not found.");
      setIsEditorLoading(false);
      return;
    }
    
    if (activeFile.needsFetching || (activeFile.originalContent === "" && activeFile.content === "")) {
      console.log("[FilesPage] useEffect[activeFilePath]: Fetching content for", activeFilePath);
      setIsEditorLoading(true);
      setEditorError(null);

      fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(activeFilePath)}&view=true`)
        .then(response => {
          if (!response.ok) {
            return response.json().then(errData => { throw new Error(errData.error || `HTTP error ${response.status}`); });
          }
          return response.text();
        })
        .then(textContent => {
          if (activeFilePathRef.current === activeFilePath) {
            setOpenedFiles(prev => prev.map(f =>
              f.path === activeFilePath ? { ...f, content: textContent, originalContent: textContent, unsavedChanges: false, needsFetching: false } : f
            ));
            console.log("[FilesPage] useEffect[activeFilePath]: Content fetched successfully for", activeFilePath);
          } else {
            console.log("[FilesPage] useEffect[activeFilePath]: Content fetched for", activeFilePath, "but tab is no longer active.");
          }
        })
        .catch((e: any) => {
          if (activeFilePathRef.current === activeFilePath) {
            const message = e.message || "Failed to load file content.";
            console.error("[FilesPage] useEffect[activeFilePath]: Error loading file content for", activeFilePath, message);
            setEditorError(message);
            toast({ title: "Error Loading File", description: message, variant: "destructive" });
          }
        })
        .finally(() => {
          if (activeFilePathRef.current === activeFilePath) {
            setIsEditorLoading(false);
          }
        });
    } else {
      console.log("[FilesPage] useEffect[activeFilePath]: Content for", activeFilePath, "already exists or is being edited. No fetch. Unsaved:", activeFile.unsavedChanges);
      setIsEditorLoading(false);
      setEditorError(null);
    }
  }, [activeFilePath, openedFiles, toast]); // Only openedFiles as dep for content updates

  const handleCloseTab = useCallback((filePathToClose: string, event: React.MouseEvent) => {
    event.stopPropagation();
    console.log("[FilesPage] handleCloseTab CALLED for filePathToClose:", filePathToClose);

    const fileToClose = openedFiles.find(f => f.path === filePathToClose);
    if (fileToClose?.unsavedChanges) {
      if (!window.confirm(`File "${fileToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
        console.log("[FilesPage] handleCloseTab: Close cancelled due to unsaved changes for", filePathToClose);
        return;
      }
    }

    setOpenedFiles(prev => {
      const remainingFiles = prev.filter(f => f.path !== filePathToClose);
      if (activeFilePath === filePathToClose) {
        if (remainingFiles.length > 0) {
          const newActivePath = remainingFiles[remainingFiles.length - 1].path;
          console.log("[FilesPage] handleCloseTab: Closed active tab. New active tab will be:", newActivePath);
          setActiveFilePath(newActivePath); 
        } else {
          console.log("[FilesPage] handleCloseTab: Closed last tab. Clearing active file.");
          setActiveFilePath(null);
        }
      }
      return remainingFiles;
    });
  }, [openedFiles, activeFilePath]);

  const handleEditorContentChange = useCallback((newContent: string) => {
    if (!activeFilePath) return;
    console.log("[FilesPage] handleEditorContentChange: activeFilePath:", activeFilePath, "New content length:", newContent.length);
    setOpenedFiles(prev =>
      prev.map(f => {
        if (f.path === activeFilePath) {
          const hasChanged = newContent !== f.originalContent;
          console.log("[FilesPage] handleEditorContentChange: File", f.name, "original length:", f.originalContent.length, "new length:", newContent.length, "hasChanged:", hasChanged);
          return { ...f, content: newContent, unsavedChanges: hasChanged };
        }
        return f;
      })
    );
  }, [activeFilePath]);

  const handleSaveFileContent = useCallback(async () => {
    if (!activeFilePath) {
      console.warn("[FilesPage] handleSaveFileContent: No active file to save.");
      return;
    }
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    if (!activeFile) {
      console.error("[FilesPage] handleSaveFileContent: Active file not found in openedFiles state.");
      return;
    }

    console.log("[FilesPage] handleSaveFileContent: Saving file", activeFilePath);
    setIsEditorSaving(true);
    setEditorError(null);

    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFilePath, content: activeFile.content }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to save file.');
      }
      toast({ title: 'Success', description: result.message || `File ${activeFile.name} saved.` });
      setOpenedFiles(prev =>
        prev.map(f =>
          f.path === activeFilePath ? { ...f, unsavedChanges: false, originalContent: activeFile.content } : f
        )
      );
      console.log("[FilesPage] handleSaveFileContent: File saved successfully", activeFilePath);
    } catch (e: any) {
      const message = e.message || "An unexpected error occurred while saving.";
      console.error("[FilesPage] handleSaveFileContent: Error saving file", activeFilePath, message);
      setEditorError(message);
      toast({ title: "Error Saving File", description: message, variant: "destructive" });
    } finally {
      setIsEditorSaving(false);
    }
  }, [activeFilePath, openedFiles, toast]);


  const handlePermissionsClick = (file: FileItem) => {
    const fullPath = path.join(currentPath, file.name).replace(/\\/g, '/');
    setPermissionDialogTargetPath(fullPath);
    setPermissionDialogCurrentRwxPerms(file.permissions || "---------");
    setPermissionDialogCurrentOctalPerms(file.octalPermissions || "000");
    setIsPermissionsDialogOpen(true);
  };

  const handlePermissionsUpdate = () => {
    setIsPermissionsDialogOpen(false);
    fetchFiles(currentPath);
  };

  const filteredFiles = useMemo(() => files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  ), [files, searchTerm]);

  const activeFileForEditor = useMemo(() => {
    if (!activeFilePath) return null;
    return openedFiles.find(f => f.path === activeFilePath) || null;
  }, [activeFilePath, openedFiles]);

  console.log("[FilesPage] RENDER CYCLE - currentPath:", currentPath, "activeFilePath:", activeFilePath, "openedFiles count:", openedFiles.length, "isEditorLoading:", isEditorLoading, "editorContent length (derived):", derivedEditorContent.length);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="File Manager"
        description="Browse and manage files on the server."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150">
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Button>
          </div>
        }
      />
      
       <div className="p-2 mb-2 text-xs bg-yellow-100 border border-yellow-300 rounded text-yellow-700">
        DEBUG: Active: {activeFilePath || "None"} | Editor Loading: {isEditorLoading.toString()} | Error: {editorError || "None"} | Derived Content Length: {derivedEditorContent.length}
      </div>
      
      {openedFiles.length > 0 && (
        <Card className="mb-6 flex-shrink-0">
          <CardHeader className="p-0 border-b">
            <div className="flex items-center px-1 pt-1 overflow-x-auto no-scrollbar">
              {openedFiles.map(file => (
                <div
                  key={file.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTabActivation(file.path)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTabActivation(file.path)}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    "h-8 px-3 rounded-b-none border-b-2 flex items-center gap-2",
                    activeFilePath === file.path
                      ? "border-primary text-primary bg-muted"
                      : "border-transparent text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {getFileIcon(file.name, 'file')}
                  <span className="truncate max-w-[150px] text-xs">{file.name}{file.unsavedChanges ? "*" : ""}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-1 p-0"
                    onClick={(e) => handleCloseTab(file.path, e)}
                    aria-label={`Close ${file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activeFilePath && (
                <div className="flex flex-col" style={{ height: 'calc(100vh - 450px)', minHeight: '300px' }}>
                 <div className="flex items-center p-2 border-b">
                    <Button onClick={handleSaveFileContent} disabled={isEditorSaving || !activeFileForEditor?.unsavedChanges} size="sm" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                      {isEditorSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Changes
                    </Button>
                    {activeFileForEditor?.unsavedChanges && <span className="ml-2 text-xs text-amber-600 italic">* Unsaved changes</span>}
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-xs" title={activeFilePath}>
                      {activeFilePath.split('/').pop()} ({derivedEditorLanguage})
                    </span>
                  </div>
                  <div className="flex-grow overflow-hidden p-1 bg-muted/30">
                    {isEditorLoading ? (
                      <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="ml-2">Loading content...</p>
                      </div>
                    ) : editorError ? (
                      <div className="flex flex-col justify-center items-center h-full text-destructive p-4">
                        <AlertTriangle className="h-8 w-8 mb-2" />
                        <p className="font-semibold">Error Loading File</p>
                        <p className="text-sm text-center">{editorError}</p>
                      </div>
                    ) : (
                      <CodeEditor
                        key={activeFilePath} 
                        value={derivedEditorContent}
                        onChange={handleEditorContentChange}
                        language={derivedEditorLanguage}
                        className="h-full w-full"
                        readOnly={false}
                      />
                    )}
                  </div>
              </div>
            )}
          </CardContent>
          {activeFilePath && (
            <CardFooter className="p-2 border-t text-xs text-muted-foreground justify-between">
              <div>Path: <span className="font-mono">{activeFilePath}</span></div>
              <div>Chars: {derivedEditorContent.length} Lines: {derivedEditorContent.split('\n').length}</div>
            </CardFooter>
          )}
        </Card>
      )}


      <Card className="flex-grow flex flex-col overflow-hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>File Explorer</CardTitle>
              <CardDescription className="mt-1">
                Current path: <span className="font-mono">{currentPath}</span>
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search files..."
                className="pl-8 w-full sm:w-[250px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Breadcrumb className="mt-4">
            <BreadcrumbList>
              {getBreadcrumbSegments.map((segment, index, arr) => (
                <React.Fragment key={segment.path + '-' + index}>
                  <BreadcrumbItem>
                    {index === arr.length - 1 ? (
                      <BreadcrumbPage>{segment.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handleBreadcrumbClick(segment.path === '/' ? -1 : index -1 );
                        }}
                      >
                        {segment.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {index < arr.length - 1 && <BreadcrumbSeparator />}
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading files...</p>
            </div>
          )}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-destructive bg-destructive/10 p-4 rounded-md">
              <AlertTriangle className="h-8 w-8 mb-2" />
              <p className="font-semibold">Error Loading Files</p>
              <p className="text-sm text-center">{error}</p>
              <Button variant="outline" onClick={() => fetchFiles(currentPath)} className="mt-4">
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !error && filteredFiles.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Folder className="mx-auto h-12 w-12 mb-2" />
              <p>This folder is empty or no files match your search.</p>
            </div>
          )}
          {!isLoading && !error && filteredFiles.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => {
                  const fullPathToItem = path.join(currentPath, file.name).replace(/\\/g, '/');
                  return (
                    <TableRow
                      key={file.name}
                      onDoubleClick={() => {
                        console.log("[FilesPage] TableRow onDoubleClick FIRED for:", file.name, "Type:", file.type);
                        handleOpenAndActivateFile(file);
                      }}
                      className={cn(
                        'cursor-pointer hover:bg-muted/50',
                        activeFilePath === fullPathToItem && file.type === 'file' && 'bg-muted' // Highlight if active in editor
                      )}
                    >
                      <TableCell>
                        {getFileIcon(file.name, file.type)}
                      </TableCell>
                      <TableCell
                        className="font-medium"
                      >
                        {file.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">{file.type}</TableCell>
                      <TableCell className="text-muted-foreground">{formatBytes(file.size)}</TableCell>
                      <TableCell className="text-muted-foreground">{file.modified ? format(new Date(file.modified), 'PPpp') : 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{file.octalPermissions || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {file.type === 'file' && (
                              <DropdownMenuItem
                                onSelect={(e) => { e.preventDefault(); window.location.href = `${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(fullPathToItem)}`; }}
                              >
                                <Download className="mr-2 h-4 w-4" /> Download
                              </DropdownMenuItem>
                            )}
                             <DropdownMenuItem onSelect={() => handleOpenAndActivateFile(file)}>
                                <Edit3 className="mr-2 h-4 w-4" /> {file.type === 'file' ? 'View/Edit' : 'Open'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handlePermissionsClick(file)}>
                                <KeyRound className="mr-2 h-4 w-4" /> Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isPermissionsDialogOpen && permissionDialogTargetPath && (
        <PermissionsDialog
          isOpen={isPermissionsDialogOpen}
          onOpenChange={setIsPermissionsDialogOpen}
          targetPath={permissionDialogTargetPath}
          currentRwxPermissions={permissionDialogCurrentRwxPerms}
          currentOctalPermissions={permissionDialogCurrentOctalPerms}
          onPermissionsUpdate={handlePermissionsUpdate}
        />
      )}
    </div>
  );
}

