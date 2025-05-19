
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  MoreHorizontal, Folder, File as FileIcon, Upload, Download, Edit3, Trash2, KeyRound, Search, ArrowLeft, Loader2, AlertTriangle, Save, X,
  FileCode2, FileJson, FileText, ImageIcon, Archive, Shell, FileTerminal, AudioWaveform, VideoIcon, Database, List, Shield, Github, Settings2, ServerCog
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import path from 'path-browserify';
import { format } from 'date-fns';
import PermissionsDialog from './components/permissions-dialog';

interface FileItem {
  name: string;
  type: 'folder' | 'file' | 'unknown';
  size?: number | null;
  modified?: string | null; // ISO string
  permissions?: string | null; // "rwxrwxrwx" format
  octalPermissions?: string | null; // "0755" format
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

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [editingFilePath, setEditingFilePath] = useState<string | null>(null);
  const [editingFileContent, setEditingFileContent] = useState<string>("");
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [permissionDialogTargetPath, setPermissionDialogTargetPath] = useState<string>("");
  const [permissionDialogCurrentRwxPerms, setPermissionDialogCurrentRwxPerms] = useState<string>("");
  const [permissionDialogCurrentOctalPerms, setPermissionDialogCurrentOctalPerms] = useState<string>("");


  const fetchFiles = useCallback(async (pathToFetch: string) => {
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
      if (data && Array.isArray(data.files)) {
        setFiles(data.files.map((f: any) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          modified: f.modified,
          permissions: f.permissions, // rwxrwxrwx string from API
          octalPermissions: f.octalPermissions, // "0755" string from API
        })));
        setCurrentPath(data.path || pathToFetch);
      } else {
        setFiles([]);
        setCurrentPath(data.path || pathToFetch);
        if (!Array.isArray(data.files)) {
          console.warn("API did not return a 'files' array. Response:", data);
        }
      }
    } catch (e: any) {
      console.error("Error fetching files:", e);
      const errorMessage = e.message || "An unknown error occurred while fetching files.";
      setError(errorMessage);
      setFiles([]);
      toast({
        title: "File Manager Error",
        description: `Could not fetch files: ${errorMessage}. Please ensure the API is responding correctly and the path is accessible.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  const handleFolderClick = (folderName: string) => {
    const newPath = path.join(currentPath, folderName);
    setCurrentPath(newPath.replace(/\\/g, '/'));
  };

  const handleBreadcrumbClick = (index: number) => {
    const segments = currentPath.split('/').filter(Boolean);
    let newPath = '/';
    if (index >= 0) {
      newPath += segments.slice(0, index + 1).join('/');
    }
    setCurrentPath(newPath.replace(/\\/g, '/'));
  };

  const getBreadcrumbSegments = useMemo(() => {
    if (currentPath === '/') return [{ name: 'Root', path: '/' }];
    const segments = currentPath.split('/').filter(Boolean);
    return [{ name: 'Root', path: '/' }, ...segments.map((segment, index) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/'),
    }))];
  }, [currentPath]);

  const handleFileDoubleClick = async (file: FileItem) => {
    if (file.type === 'folder') {
      handleFolderClick(file.name);
      return;
    }
    const fullPath = path.join(currentPath, file.name).replace(/\\/g, '/');
    setEditingFilePath(fullPath);
    setEditingFile(file);
    setIsEditorLoading(true);
    setEditorError(null);
    setEditingFileContent("");

    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(fullPath)}&view=true`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Failed to load file content. Status: ${response.status}` }));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const content = await response.text();
      setEditingFileContent(content);
    } catch (e: any) {
      setEditorError(e.message || "Failed to load file content.");
      toast({ title: "Error", description: `Could not load file: ${e.message}`, variant: "destructive" });
    } finally {
      setIsEditorLoading(false);
    }
  };

  const handleSaveFileContent = async () => {
    if (!editingFilePath || editingFileContent === null) return;
    setIsEditorSaving(true);
    setEditorError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editingFilePath, content: editingFileContent }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to save file.');
      }
      toast({ title: 'Success', description: result.message || `File ${editingFile?.name} saved.` });
      closeEditorDialog();
      fetchFiles(currentPath); 
    } catch (e: any) {
      setEditorError(e.message || "An unexpected error occurred while saving.");
      toast({ title: "Error Saving File", description: e.message, variant: "destructive" });
    } finally {
      setIsEditorSaving(false);
    }
  };

  const closeEditorDialog = () => {
    setEditingFilePath(null);
    setEditingFile(null);
    setEditingFileContent("");
    setEditorError(null);
  };

  const handlePermissionsClick = (file: FileItem) => {
    const fullPath = path.join(currentPath, file.name).replace(/\\/g, '/');
    setPermissionDialogTargetPath(fullPath);
    setPermissionDialogCurrentRwxPerms(file.permissions || "---------");
    setPermissionDialogCurrentOctalPerms(file.octalPermissions || "000");
    setIsPermissionsDialogOpen(true);
  };

  const handlePermissionsUpdate = () => {
    setIsPermissionsDialogOpen(false);
    fetchFiles(currentPath); // Refresh file list
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="File Manager"
        description="Manage files directly on the server via internal API."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150">
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>File Explorer</CardTitle>
              <CardDescription className="mt-1">
                Current path: {currentPath}
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
        <CardContent>
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
                      onDoubleClick={() => handleFileDoubleClick(file)}
                      className={file.type === 'folder' ? 'cursor-pointer hover:bg-muted/50' : 'cursor-pointer hover:bg-muted/50'}
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
                             <DropdownMenuItem onSelect={() => handleFileDoubleClick(file)}>
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

      {editingFile && editingFilePath && (
        <Dialog open={!!editingFilePath} onOpenChange={(isOpen) => { if (!isOpen) closeEditorDialog(); }}>
          <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-7xl h-[90vh] p-0 flex flex-col rounded-2xl backdrop-blur-sm">
            <DialogHeader className="p-4 pb-3 border-b">
              <DialogTitle>Editing: {editingFile.name}</DialogTitle>
              <DialogDescription>
                Path: <span className="font-mono text-xs">{editingFilePath}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="flex-grow overflow-hidden flex flex-row"> {/* Main content area: flex row */}
              {/* Visual Line Number Gutter Placeholder */}
              <div className="w-12 bg-muted/50 border-r border-border py-2 px-1 text-right text-muted-foreground text-xs select-none overflow-y-hidden shrink-0">
                {/* This is a placeholder. Real line numbers require JS sync with textarea scroll/content. */}
              </div>
              <div className="flex-grow overflow-hidden flex flex-col"> {/* Editor area: flex column to allow ScrollArea to grow */}
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
                  <ScrollArea className="flex-grow w-full bg-background"> {/* ScrollArea takes available space */}
                    <Textarea
                      value={editingFileContent}
                      onChange={(e) => setEditingFileContent(e.target.value)}
                      className="h-full w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-4 font-mono text-sm leading-relaxed tracking-wide bg-transparent"
                      placeholder="File content will appear here..."
                    />
                  </ScrollArea>
                )}
              </div>
            </div>
            <DialogFooter className="p-3 border-t flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                Chars: {editingFileContent.length}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeEditorDialog} disabled={isEditorSaving}>
                  <X className="mr-2 h-4 w-4" /> Close
                </Button>
                <Button type="button" onClick={handleSaveFileContent} disabled={isEditorLoading || isEditorSaving} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  {isEditorSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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

