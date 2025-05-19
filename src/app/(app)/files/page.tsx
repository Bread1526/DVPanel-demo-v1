
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Folder, File as FileIcon, Upload, Download, Edit3, Trash2, KeyRound, Search, ArrowLeft, Loader2, AlertTriangle, Save, X } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import path from 'path-browserify'; // Using path-browserify for client-side path manipulation

interface FileItem {
  name: string;
  type: 'folder' | 'file';
  size?: string;
  modified?: string;
  permissions?: string;
}

const DAEMON_API_BASE_PATH = '/api/panel-daemon'; // Internal API path

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // State for the file editor dialog
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [editingFilePath, setEditingFilePath] = useState<string | null>(null);
  const [editingFileContent, setEditingFileContent] = useState<string>("");
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);


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
          // console.error("Failed to parse error response from daemon API:", parseError);
          errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (data && Array.isArray(data.files)) {
        setFiles(data.files.map((f: any) => ({
          name: f.name,
          type: f.type,
          size: f.size || 'N/A',
          modified: f.modified || 'N/A',
          permissions: f.permissions || 'N/A',
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
        description: `Could not fetch files: ${errorMessage}. Please ensure the backend is configured correctly and the path is accessible.`,
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

  const getBreadcrumbSegments = () => {
    if (currentPath === '/') return [{ name: 'Root', path: '/' }];
    const segments = currentPath.split('/').filter(Boolean);
    return [{ name: 'Root', path: '/' }, ...segments.map((segment, index) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/'),
    }))];
  };

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

  const closeEditorDialog = () => {
    setEditingFilePath(null);
    setEditingFile(null);
    setEditingFileContent("");
    setEditorError(null);
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
              {getBreadcrumbSegments().map((segment, index, arr) => (
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
                        {file.type === 'folder' ? <Folder className="h-5 w-5 text-primary" /> : <FileIcon className="h-5 w-5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell
                        className="font-medium"
                      >
                        {file.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">{file.type}</TableCell>
                      <TableCell className="text-muted-foreground">{file.size || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">{file.modified || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{file.permissions || 'N/A'}</TableCell>
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
                            <DropdownMenuItem><KeyRound className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
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
          <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl h-[80vh] flex flex-col rounded-2xl backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle>Viewing: {editingFile.name}</DialogTitle>
              <DialogDescription>
                Path: {editingFilePath}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-grow overflow-hidden py-4">
              {isEditorLoading ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-2">Loading content...</p>
                </div>
              ) : editorError ? (
                <div className="flex flex-col justify-center items-center h-full text-destructive">
                  <AlertTriangle className="h-8 w-8 mb-2" />
                  <p>Error loading file: {editorError}</p>
                </div>
              ) : (
                <ScrollArea className="h-full border rounded-md bg-background">
                  <Textarea
                    value={editingFileContent}
                    readOnly // For now, make it read-only. Editing requires a save mechanism.
                    className="h-full w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-2 font-mono text-sm"
                    placeholder="File content will appear here..."
                  />
                </ScrollArea>
              )}
            </div>
            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="outline" onClick={closeEditorDialog}>
                <X className="mr-2 h-4 w-4" /> Close
              </Button>
              <Button type="button" disabled /* Save functionality not implemented */ className="shadow-md hover:scale-105 transform transition-transform duration-150">
                <Save className="mr-2 h-4 w-4" /> Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

