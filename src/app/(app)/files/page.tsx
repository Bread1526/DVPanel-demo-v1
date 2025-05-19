
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  MoreHorizontal, Folder, File as FileIconDefault, Upload, Download, Edit3, Trash2, KeyRound, Search as SearchIconInput, ArrowLeft, Loader2, AlertTriangle,
  FileCode2, FileJson, FileText, ImageIcon, Archive, Shell, FileTerminal, AudioWaveform, VideoIcon, Database, List, Shield, Github, Settings2, ServerCog, Save, X,
  Camera, // New icon
  Search as SearchIcon // New icon (aliased)
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useToast } from "@/hooks/use-toast";
import path from 'path-browserify';
import { format, formatDistanceToNow } from 'date-fns';
import PermissionsDialog from './components/permissions-dialog';
import { cn } from '@/lib/utils';
import CodeEditor from '@/components/ui/code-editor';

interface OpenedFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  unsavedChanges: boolean;
  needsFetching: boolean;
}

interface FileItem {
  name: string;
  type: 'folder' | 'file' | 'unknown';
  size?: number | null;
  modified?: string | null; // ISO string
  permissions?: string | null; // rwx string
  octalPermissions?: string | null; // e.g., "0755"
}

const DAEMON_API_BASE_PATH = '/api/panel-daemon';

function formatBytes(bytes?: number | null, decimals = 2) {
  if (bytes === null || bytes === undefined || !+bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileIcon(filename: string, fileType: FileItem['type']): React.ReactNode {
  if (fileType === 'folder') return <Folder className="h-5 w-5 text-primary" />;
  if (fileType === 'unknown') return <FileIconDefault className="h-5 w-5 text-muted-foreground" />;

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
    default: return <FileIconDefault className="h-5 w-5 text-muted-foreground" />;
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
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [permissionDialogTargetPath, setPermissionDialogTargetPath] = useState<string>("");
  const [permissionDialogCurrentRwxPerms, setPermissionDialogCurrentRwxPerms] = useState<string>("");
  const [permissionDialogCurrentOctalPerms, setPermissionDialogCurrentOctalPerms] = useState<string>("");

  // Editor State
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const activeFilePathRef = useRef<string | null>(null); // Ref to track active path for async operations

  const [isEditorLoading, setIsEditorLoading] = useState<boolean>(false);
  const [isEditorSaving, setIsEditorSaving] = useState<boolean>(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  const fetchFiles = useCallback(async (pathToFetch: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/files?path=${encodeURIComponent(pathToFetch)}`);
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try { const errData = await response.json(); errorMsg = errData.error || errData.details || errorMsg; }
        catch (parseError) { errorMsg = await response.text().catch(() => errorMsg); }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (data && Array.isArray(data.files)) {
        setFiles(data.files.map((f: any) => ({ ...f })));
        setCurrentPath(data.path || pathToFetch);
      } else {
        setFiles([]);
        setCurrentPath(data.path || pathToFetch);
      }
    } catch (e: any) {
      const errorMessage = e.message || "An unknown error occurred while fetching files.";
      setError(errorMessage);
      setFiles([]);
      toast({ title: "File Manager Error", description: `Could not fetch files: ${errorMessage}.`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  const editorLanguage = useMemo(() => {
    if (!activeFilePath) return 'plaintext';
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    return activeFile ? activeFile.language : getLanguageFromFilename(path.basename(activeFilePath));
  }, [activeFilePath, openedFiles]);

  const editorContent = useMemo(() => {
    if (!activeFilePath) return "";
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    return activeFile?.content ?? "";
  }, [activeFilePath, openedFiles]);
  
  const hasUnsavedChanges = useMemo(() => {
    if (!activeFilePath) return false;
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    return activeFile?.unsavedChanges ?? false;
  }, [activeFilePath, openedFiles]);


  const handleEditorContentChange = useCallback((newContent: string) => {
    if (!activeFilePath) return;
    setOpenedFiles(prev =>
      prev.map(file =>
        file.path === activeFilePath
          ? { ...file, content: newContent, unsavedChanges: newContent !== file.originalContent }
          : file
      )
    );
  }, [activeFilePath]);

  const handleSaveFileContent = useCallback(async () => {
    if (!activeFilePath) {
      toast({ title: "Error", description: "No active file to save.", variant: "destructive" });
      return;
    }
    const activeFile = openedFiles.find(f => f.path === activeFilePath);
    if (!activeFile) return;

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
        prev.map(file =>
          file.path === activeFilePath
            ? { ...file, originalContent: activeFile.content, unsavedChanges: false }
            : file
        )
      );
    } catch (e: any) {
      setEditorError(e.message || "An unexpected error occurred while saving.");
      toast({ title: "Error Saving File", description: e.message, variant: "destructive" });
    } finally {
      setIsEditorSaving(false);
    }
  }, [activeFilePath, openedFiles, toast]);

  const handleTabActivation = useCallback((filePathToActivate: string) => {
    setActiveFilePath(filePathToActivate);
    // Move the activated tab to the end of the array to ensure it's rendered "on top" or last in tab order
    setOpenedFiles(prev => {
      const fileIndex = prev.findIndex(f => f.path === filePathToActivate);
      if (fileIndex === -1) return prev; // Should not happen if called correctly
      const fileToActivate = prev[fileIndex];
      const restOfFiles = [...prev.slice(0, fileIndex), ...prev.slice(fileIndex + 1)];
      return [...restOfFiles, fileToActivate];
    });
  }, []);


 useEffect(() => {
    if (!activeFilePath) {
      setEditorError(null);
      setIsEditorLoading(false);
      return;
    }

    const activeFile = openedFiles.find(f => f.path === activeFilePath);

    if (activeFile && activeFile.needsFetching) {
      setIsEditorLoading(true);
      setEditorError(null);
      fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(activeFilePath)}&view=true`)
        .then(async response => {
          if (!response.ok) {
            let errorMsg = `Error fetching file: ${response.status}`;
            try { const errData = await response.json(); errorMsg = errData.error || errData.details || errorMsg; }
            catch (parseError) { errorMsg = await response.text().catch(() => errorMsg); }
            throw new Error(errorMsg);
          }
          return response.text();
        })
        .then(textContent => {
          if (activeFilePathRef.current === activeFilePath) { // Ensure tab is still active
            setOpenedFiles(prev =>
              prev.map(f =>
                f.path === activeFilePath
                  ? { ...f, content: textContent, originalContent: textContent, needsFetching: false, unsavedChanges: false }
                  : f
              )
            );
          }
        })
        .catch(e => {
          if (activeFilePathRef.current === activeFilePath) {
            setEditorError(e.message || "Failed to load file content.");
            toast({ title: "Error Loading File", description: e.message, variant: "destructive" });
          }
        })
        .finally(() => {
          if (activeFilePathRef.current === activeFilePath) {
            setIsEditorLoading(false);
          }
        });
    } else if (activeFile && !activeFile.needsFetching) {
        setIsEditorLoading(false); // Content already loaded or not needed
        setEditorError(null);
    }
  }, [activeFilePath, openedFiles, toast]);


  const handleOpenAndActivateFile = useCallback((fileItem: FileItem) => {
    if (fileItem.type === 'folder') {
      setCurrentPath(prev => path.join(prev, fileItem.name).replace(/\\/g, '/'));
      return;
    }
    if (fileItem.type !== 'file') return;

    const fullPath = path.join(currentPath, fileItem.name).replace(/\\/g, '/');
    const existingFile = openedFiles.find(f => f.path === fullPath);

    if (!existingFile) {
      setOpenedFiles(prev => [
        ...prev,
        {
          path: fullPath,
          name: fileItem.name,
          content: "", // Will be fetched by useEffect
          originalContent: "", // Will be set after fetch
          language: getLanguageFromFilename(fileItem.name),
          unsavedChanges: false,
          needsFetching: true,
        },
      ]);
    }
    handleTabActivation(fullPath);
  }, [currentPath, openedFiles, handleTabActivation]);

  const handleCloseTab = useCallback((filePathToClose: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent tab activation when clicking close button
    const fileToClose = openedFiles.find(f => f.path === filePathToClose);
    if (fileToClose?.unsavedChanges) {
      if (!window.confirm(`File ${fileToClose.name} has unsaved changes. Are you sure you want to close?`)) {
        return;
      }
    }

    setOpenedFiles(prev => {
      const newOpenedFiles = prev.filter(f => f.path !== filePathToClose);
      if (activeFilePath === filePathToClose) {
        if (newOpenedFiles.length > 0) {
          setActiveFilePath(newOpenedFiles[newOpenedFiles.length - 1].path);
        } else {
          setActiveFilePath(null);
        }
      }
      return newOpenedFiles;
    });
  }, [activeFilePath, openedFiles]);


  const handleBreadcrumbClick = useCallback((index: number) => {
    const segments = currentPath.split('/').filter(Boolean);
    let newPath = '/';
    if (index >= 0) { newPath += segments.slice(0, index + 1).join('/'); }
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

  const handlePermissionsClick = (file: FileItem) => {
    const fullPath = path.join(currentPath, file.name).replace(/\\/g, '/');
    setPermissionDialogTargetPath(fullPath);
    setPermissionDialogCurrentRwxPerms(file.permissions || "---------");
    setPermissionDialogCurrentOctalPerms(file.octalPermissions || "0000");
    setIsPermissionsDialogOpen(true);
  };

  const handlePermissionsUpdate = () => {
    setIsPermissionsDialogOpen(false);
    fetchFiles(currentPath);
  };

  const filteredFiles = useMemo(() => files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  ), [files, searchTerm]);


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
      
      <div className="flex-grow flex flex-col gap-2 overflow-hidden">
        <Card className="flex-shrink-0"> {/* File Explorer Card */}
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>File Explorer</CardTitle>
                <CardDescription className="mt-1">
                  Current path: <span className="font-mono">{currentPath}</span>
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-auto">
                <SearchIconInput className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
                          onClick={(e) => { e.preventDefault(); handleBreadcrumbClick(segment.path === '/' ? -1 : index -1 ); }}
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
          <CardContent className="max-h-[40vh] overflow-y-auto"> {/* Limit height of file list */}
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
                        onDoubleClick={() => handleOpenAndActivateFile(file)}
                        className='cursor-pointer hover:bg-muted/50'
                      >
                        <TableCell>{getFileIcon(file.name, file.type)}</TableCell>
                        <TableCell className="font-medium">{file.name}</TableCell>
                        <TableCell className="text-muted-foreground capitalize">{file.type}</TableCell>
                        <TableCell className="text-muted-foreground">{formatBytes(file.size)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {file.modified ? formatDistanceToNow(new Date(file.modified), { addSuffix: true }) : 'N/A'}
                        </TableCell>
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
        </Card> {/* End File Explorer Card */}

        {/* Editor Area - Tabs and CodeEditor */}
        {openedFiles.length > 0 && (
          <div className="flex-grow flex flex-col mt-0 border rounded-lg shadow-sm overflow-hidden bg-card min-h-0">
            {/* Tab Bar */}
            <div className="flex-shrink-0 flex items-center border-b bg-muted/30 overflow-x-auto no-scrollbar pr-10">
              {openedFiles.map((file) => (
                <div
                  key={file.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTabActivation(file.path)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTabActivation(file.path)}
                  className={cn(
                    "flex items-center py-2 px-3 text-sm font-medium cursor-pointer border-r whitespace-nowrap",
                    activeFilePath === file.path
                      ? "bg-background text-primary border-b-2 border-b-primary -mb-px" // Active tab style
                      : "text-muted-foreground hover:bg-background/70"
                  )}
                >
                  {getFileIcon(file.name, 'file')} 
                  <span className="ml-2 mr-1 truncate max-w-[150px]">{file.name}{file.unsavedChanges ? "*" : ""}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-auto rounded-full hover:bg-destructive/20 hover:text-destructive"
                    onClick={(e) => handleCloseTab(file.path, e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            
            {/* Toolbar */}
            {activeFilePath && (
                <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={handleSaveFileContent} disabled={isEditorSaving || !hasUnsavedChanges} className="shadow-sm hover:scale-105">
                        {isEditorSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toast({ title: "Find Action", description: "Find in file functionality coming soon!"})} className="shadow-sm hover:scale-105">
                            <SearchIcon className="mr-2 h-4 w-4" /> Find
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toast({ title: "Snapshots Action", description: "File snapshots functionality coming soon!"})} className="shadow-sm hover:scale-105">
                            <Camera className="mr-2 h-4 w-4" /> Snapshots
                        </Button>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mr-2">
                        <span>{path.basename(activeFilePath)}</span>
                        <span className="mx-1">|</span>
                        <span>Lang: {editorLanguage}</span>
                        <span className="mx-1">|</span>
                        <span>Chars: {editorContent.length}</span>
                        <span className="mx-1">|</span>
                        <span>Lines: {editorContent.split('\n').length}</span>
                        {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">* Unsaved</span>}
                    </div>
                </div>
            )}

            {/* Code Editor Area */}
            <div className="flex-grow relative p-0 bg-background min-h-0"> {/* Added min-h-0 here */}
              {isEditorLoading && (
                <div className="absolute inset-0 flex justify-center items-center bg-background/80 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-2 text-muted-foreground">Loading content...</p>
                </div>
              )}
              {editorError && !isEditorLoading && (
                 <div className="absolute inset-0 flex flex-col justify-center items-center text-destructive p-4 bg-destructive/10">
                    <AlertTriangle className="h-10 w-10 mb-2" />
                    <p className="font-semibold">Error Loading File</p>
                    <p className="text-sm text-center mb-3">{editorError}</p>
                 </div>
              )}
              {activeFilePath && !isEditorLoading && !editorError && (
                <CodeEditor
                  key={activeFilePath} // Force re-mount on file change
                  value={editorContent}
                  onChange={handleEditorContentChange}
                  language={editorLanguage}
                  readOnly={isEditorSaving}
                  className="h-full w-full border-0 rounded-none"
                />
              )}
              {!activeFilePath && !isEditorLoading && !editorError && (
                  <div className="flex h-full justify-center items-center text-muted-foreground">
                      <p>No file selected or all tabs closed.</p>
                  </div>
              )}
            </div>
          </div>
        )}
      </div>

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


    