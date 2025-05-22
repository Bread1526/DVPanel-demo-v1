
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog as UIDialog, DialogClose, DialogContent as UIDialogContent, DialogHeader as UIDialogHeader, DialogTitle as UIDialogTitle, DialogDescription as UIDialogDesc, DialogFooter as UIDialogFooter } from "@/components/ui/dialog"; // Renamed Dialog
import {
  MoreHorizontal, Folder as FolderIcon, File as FileIconDefault, Upload, Download, Edit3, Trash2, KeyRound, Search, ArrowLeft, Loader2, AlertTriangle,
  FileCode2 as FileCode2Icon, FileJson as FileJsonIcon, FileText as FileTextIcon, ImageIcon as ImageIconLucide, Archive as ArchiveIcon, Shell as ShellIcon, FileTerminal as FileTerminalIcon, AudioWaveform as AudioWaveformIcon, VideoIcon as VideoIconLucide, Database as DatabaseIcon, List as ListIcon, Shield as ShieldIcon, Github as GithubIcon, Settings2 as Settings2Icon, ServerCog as ServerCogIcon,
  FolderPlus, FilePlus, X, ChevronRight, FileWarning
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useToast } from "@/hooks/use-toast";
import path from 'path-browserify'; 
import { format, formatDistanceToNowStrict } from 'date-fns';
import PermissionsDialog from './components/permissions-dialog';
import ImageViewerDialog from './components/image-viewer-dialog';
import EditorDialog from './components/editor-dialog';
import { useRouter } from 'next/navigation';

interface FileItem {
  name: string;
  type: 'folder' | 'file' | 'link' | 'unknown';
  size?: number | null;
  modified?: string | null; 
  permissions?: string | null; 
  octalPermissions?: string | null; 
}

function formatBytes(bytes?: number | null, decimals = 2) {
  if (bytes === null || bytes === undefined || !+bytes || bytes === 0) return '0 B'; // Changed to B from Bytes
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']; // Changed Bytes to B
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function isImageExtension(filename: string): boolean {
  if (!filename) return false;
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
  const extension = path.extname(filename).toLowerCase();
  return imageExtensions.includes(extension);
}

function getFileIcon(filename: string, fileType: FileItem['type']): React.ReactNode {
  if (fileType === 'folder') return <FolderIcon className="h-5 w-5 text-primary" />;
  if (fileType === 'link') return <FileIconDefault className="h-5 w-5 text-purple-400" />; // Example for symlink
  if (fileType === 'unknown') return <FileIconDefault className="h-5 w-5 text-muted-foreground" />;

  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.json': return <FileJsonIcon className="h-5 w-5 text-yellow-600" />;
    case '.yaml': case '.yml': return <ServerCogIcon className="h-5 w-5 text-indigo-400" />;
    case '.html': case '.htm': return <FileCode2Icon className="h-5 w-5 text-orange-500" />;
    case '.css': case '.scss': case '.sass': return <FileCode2Icon className="h-5 w-5 text-blue-500" />;
    case '.js': case '.jsx': case '.ts': case '.tsx': return <FileCode2Icon className="h-5 w-5 text-yellow-500" />;
    case '.txt': case '.md': case '.log': return <FileTextIcon className="h-5 w-5 text-gray-500" />;
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.svg': case '.webp': case '.ico': return <ImageIconLucide className="h-5 w-5 text-purple-500" />;
    case '.zip': case '.tar': case '.gz': case '.rar': case '.7z': return <ArchiveIcon className="h-5 w-5 text-amber-700" />;
    case '.sh': case '.bash': return <ShellIcon className="h-5 w-5 text-green-600" />;
    case '.bat': case '.cmd': return <FileTerminalIcon className="h-5 w-5 text-gray-700" />;
    case '.mp3': case '.wav': case '.ogg': return <AudioWaveformIcon className="h-5 w-5 text-pink-500" />;
    case '.mp4': case '.mov': case '.avi': case '.mkv': return <VideoIconLucide className="h-5 w-5 text-red-500" />;
    case '.db': case '.sqlite': case '.sql': return <DatabaseIcon className="h-5 w-5 text-indigo-500" />;
    case '.csv': case '.xls': case '.xlsx': return <ListIcon className="h-5 w-5 text-green-700" />;
    case '.exe': case '.dmg': case '.app': return <Settings2Icon className="h-5 w-5 text-gray-800" />;
    case '.pem': case '.crt': case '.key': return <ShieldIcon className="h-5 w-5 text-teal-500" />;
    case '.gitignore': case '.gitattributes': case '.gitmodules': return <GithubIcon className="h-5 w-5 text-neutral-700" />;
    default: return <FileIconDefault className="h-5 w-5 text-muted-foreground" />;
  }
}

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [pathInput, setPathInput] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const router = useRouter();

  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [permissionDialogTargetPath, setPermissionDialogTargetPath] = useState<string>("");
  const [permissionDialogCurrentRwxPerms, setPermissionDialogCurrentRwxPerms] = useState<string>("");
  const [permissionDialogCurrentOctalPerms, setPermissionDialogCurrentOctalPerms] = useState<string>("");

  const [isCreateItemDialogOpen, setIsCreateItemDialogOpen] = useState(false);
  const [createItemType, setCreateItemType] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [currentImageViewerSrc, setCurrentImageViewerSrc] = useState<string | null>(null);
  const [currentImageViewerAlt, setCurrentImageViewerAlt] = useState<string | null>(null);
  const [imageFilesInCurrentDir, setImageFilesInCurrentDir] = useState<FileItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);

  const [isEditorDialogOpen, setIsEditorDialogOpen] = useState(false);
  const [filePathForEditorDialog, setFilePathForEditorDialog] = useState<string | null>(null);


  const fetchFiles = useCallback(async (pathToFetch: string) => {
    console.log("[FilesPage] fetchFiles CALLED for path:", pathToFetch);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/panel-daemon/files?path=${encodeURIComponent(pathToFetch)}`);
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        let errData = { error: errorMsg, details: "" };
        try { 
            errData = await response.json(); 
        } catch (parseError) { 
            errorMsg = await response.text().catch(() => errorMsg) || errorMsg; 
            errData = { error: errorMsg, details: "Could not parse error response from server." };
        }
        const detailedMessage = errData.details ? `${errData.error} Details: ${errData.details}` : errData.error;
        throw new Error(detailedMessage);
      }
      const data = await response.json();
      const fetchedFiles = (data && Array.isArray(data.files)) ? data.files : [];
      setFiles(fetchedFiles);
      setCurrentPath(data.path || pathToFetch); 
      setImageFilesInCurrentDir(fetchedFiles.filter((f: FileItem) => f.type === 'file' && isImageExtension(f.name)));
      console.log("[FilesPage] fetchFiles RESPONSE for path:", pathToFetch, "DATA:", data);
    } catch (e: any) {
      const errorMessage = e.message || "An unknown error occurred while fetching files.";
      setError(errorMessage);
      setFiles([]); 
      setImageFilesInCurrentDir([]);
      toast({ title: "File Manager Error", description: `Could not load files for "${pathToFetch}": ${errorMessage}.`, variant: "destructive" });
      console.error("[FilesPage] fetchFiles ERROR:", e);
    } finally {
      setIsLoading(false);
      console.log("[FilesPage] fetchFiles FINISHED for path:", pathToFetch);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, fetchFiles]);

  useEffect(() => {
    setPathInput(currentPath);
  }, [currentPath]);

  const handlePathSubmit = () => {
    const trimmedPath = pathInput.trim();
    let normalized = path.normalize(trimmedPath === '' ? '/' : trimmedPath);
    if (normalized !== '/' && !normalized.startsWith('/')) { normalized = '/' + normalized; }
    if (normalized !== '/' && normalized.endsWith('/')) { normalized = normalized.slice(0, -1); }
    setCurrentPath(normalized || '/');
  };

  const handleFolderClick = useCallback((folderPath: string) => {
    setCurrentPath(folderPath);
  }, []);

  const handleFileDoubleClick = useCallback((fileItem: FileItem) => {
    console.log("[FilesPage] TableRow onDoubleClick FIRED for:", fileItem.name, "Type:", fileItem.type);
    const fullPath = path.join(currentPath, fileItem.name).replace(/\\/g, '/');
    if (fileItem.type === 'folder') {
      handleFolderClick(fullPath);
    } else if (fileItem.type === 'file') {
      if (isImageExtension(fileItem.name)) {
        const imageIndex = imageFilesInCurrentDir.findIndex(f => f.name === fileItem.name);
        if (imageIndex !== -1) {
          setCurrentImageIndex(imageIndex);
          setCurrentImageViewerSrc(`/api/panel-daemon/file?path=${encodeURIComponent(fullPath)}`);
          setCurrentImageViewerAlt(fileItem.name);
          setIsImageViewerOpen(true);
        } else {
            toast({title: "Error", description: "Could not find image in current directory list.", variant: "destructive"});
        }
      } else {
        setFilePathForEditorDialog(fullPath);
        setIsEditorDialogOpen(true);
      }
    }
  }, [currentPath, imageFilesInCurrentDir, toast, handleFolderClick]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const segments = currentPath.split('/').filter(Boolean);
    let newPath = '/';
    if (index >= 0) { newPath += segments.slice(0, index + 1).join('/'); }
    setCurrentPath(newPath.replace(/\\/g, '/'));
  }, [currentPath]);

  const breadcrumbSegments = useMemo(() => {
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
  
  const handleNextImage = useCallback(() => {
    if (currentImageIndex < imageFilesInCurrentDir.length - 1) {
      const nextIndex = currentImageIndex + 1;
      const nextImage = imageFilesInCurrentDir[nextIndex];
      const fullPath = path.join(currentPath, nextImage.name).replace(/\\/g, '/');
      setCurrentImageViewerSrc(`/api/panel-daemon/file?path=${encodeURIComponent(fullPath)}`);
      setCurrentImageViewerAlt(nextImage.name);
      setCurrentImageIndex(nextIndex);
    }
  }, [currentImageIndex, imageFilesInCurrentDir, currentPath]);

  const handlePreviousImage = useCallback(() => {
     if (currentImageIndex > 0) {
      const prevIndex = currentImageIndex - 1;
      const prevImage = imageFilesInCurrentDir[prevIndex];
      const fullPath = path.join(currentPath, prevImage.name).replace(/\\/g, '/');
      setCurrentImageViewerSrc(`/api/panel-daemon/file?path=${encodeURIComponent(fullPath)}`);
      setCurrentImageViewerAlt(prevImage.name);
      setCurrentImageIndex(prevIndex);
    }
  }, [currentImageIndex, imageFilesInCurrentDir, currentPath]);


  const filteredFiles = useMemo(() => files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  ), [files, searchTerm]);

  const openCreateItemDialog = (type: 'file' | 'folder') => {
    setCreateItemType(type);
    setNewItemName('');
    setIsCreateItemDialogOpen(true);
  };

  const handleCreateItem = async () => {
    if (!createItemType || !newItemName.trim()) {
      toast({ title: "Error", description: "Name cannot be empty.", variant: "destructive" });
      return;
    }
    setIsCreatingItem(true);
    try {
      const response = await fetch(`/api/panel-daemon/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: newItemName, type: createItemType }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || `Failed to create ${createItemType}.`);
      }
      toast({ title: "Success", description: result.message || `${createItemType} "${newItemName}" created.` });
      setIsCreateItemDialogOpen(false);
      fetchFiles(currentPath); 
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsCreatingItem(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="File Manager"
        description="Browse and manage files on the server."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openCreateItemDialog('file')} className="shadow-md hover:scale-105 transform transition-transform duration-150">
              <FilePlus className="mr-2 h-4 w-4" /> New File
            </Button>
            <Button variant="outline" onClick={() => openCreateItemDialog('folder')} className="shadow-md hover:scale-105 transform transition-transform duration-150">
              <FolderPlus className="mr-2 h-4 w-4" /> New Folder
            </Button>
            <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Button>
          </div>
        }
      />
      
      <div className="flex-grow flex flex-col overflow-hidden gap-2">
        <Card className="flex-shrink-0">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center gap-2 flex-grow w-full sm:w-auto">
                <Label htmlFor="path-input-fm" className="text-sm text-muted-foreground whitespace-nowrap">Path:</Label>
                <Input
                  id="path-input-fm"
                  className="font-mono h-9 flex-grow text-sm"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePathSubmit(); } }}
                  placeholder="Enter path and press Enter..."
                />
                 <Button onClick={handlePathSubmit} size="sm" variant="outline" className="h-9 shadow-sm">
                  <ChevronRight className="h-4 w-4" /> Go
                </Button>
              </div>
              <div className="relative w-full sm:w-auto sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search current directory..."
                  className="pl-8 w-full h-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <Breadcrumb className="mt-3">
              <BreadcrumbList>
                {breadcrumbSegments.map((segment, index, arr) => (
                  <React.Fragment key={segment.path + '-' + index}>
                    <BreadcrumbItem>
                      {index === arr.length - 1 ? (
                        <BreadcrumbPage className="text-sm">{segment.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          href="#"
                          onClick={(e) => { e.preventDefault(); setCurrentPath(segment.path); }}
                          className="text-sm"
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
        </Card>
        
        <Card className="flex-grow flex flex-col overflow-hidden">
          <CardContent className="flex-grow overflow-y-auto p-0">
            {isLoading && ( <div className="flex justify-center items-center py-10 h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2 text-muted-foreground">Loading files...</p></div> )}
            {error && !isLoading && ( <div className="flex flex-col items-center justify-center py-10 h-full text-destructive bg-destructive/10 p-4 rounded-md m-4"><FileWarning className="h-8 w-8 mb-2" /><p className="font-semibold">Error Loading Files</p><p className="text-sm text-center">{error}</p><Button variant="outline" onClick={() => fetchFiles(currentPath)} className="mt-4"> Retry </Button></div>)}
            {!isLoading && !error && filteredFiles.length === 0 && ( <div className="flex flex-col justify-center items-center h-full text-muted-foreground text-center py-10"><FolderIcon className="mx-auto h-12 w-12 mb-2 text-muted" /><p>This folder is empty or no files match your search.</p></div> )}
            {!isLoading && !error && filteredFiles.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] pl-4"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Size</TableHead>
                    <TableHead className="hidden lg:table-cell">Modified</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file) => {
                    const fullPathToItem = path.join(currentPath, file.name).replace(/\\/g, '/');
                    return (
                      <TableRow
                        key={file.name}
                        onDoubleClick={() => handleFileDoubleClick(file)}
                        className='cursor-pointer hover:bg-muted/50'
                      >
                        <TableCell className="pl-4">{getFileIcon(file.name, file.type)}</TableCell>
                        <TableCell className="font-medium truncate max-w-xs sm:max-w-sm md:max-w-md">{file.name}</TableCell>
                        <TableCell className="text-muted-foreground capitalize hidden sm:table-cell">{file.type}</TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{formatBytes(file.size)}</TableCell>
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {file.modified ? formatDistanceToNowStrict(new Date(file.modified), { addSuffix: true }) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{file.octalPermissions || 'N/A'}</TableCell>
                        <TableCell className="text-right pr-4">
                           <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shadow-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                               <DropdownMenuItem onSelect={() => handleFileDoubleClick(file)}>
                                  <Edit3 className="mr-2 h-4 w-4" /> {file.type === 'folder' ? 'Open Folder' : 'View/Edit'}
                              </DropdownMenuItem>
                              {file.type === 'file' && (
                                <DropdownMenuItem
                                  onSelect={(e) => { e.preventDefault(); window.location.href = `/api/panel-daemon/file?path=${encodeURIComponent(fullPathToItem)}`; }}
                                >
                                  <Download className="mr-2 h-4 w-4" /> Download
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => handlePermissionsClick(file)}>
                                  <KeyRound className="mr-2 h-4 w-4" /> Permissions
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground" disabled>
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
      
      {ImageViewerDialog && (
        <ImageViewerDialog
            isOpen={isImageViewerOpen}
            onOpenChange={setIsImageViewerOpen}
            imageSrc={currentImageViewerSrc}
            imageAlt={currentImageViewerAlt}
            onNext={handleNextImage}
            onPrevious={handlePreviousImage}
            hasNext={currentImageIndex < imageFilesInCurrentDir.length - 1}
            hasPrevious={currentImageIndex > 0}
        />
      )}

       {EditorDialog && (
          <EditorDialog
            isOpen={isEditorDialogOpen}
            onOpenChange={setIsEditorDialogOpen}
            filePathToEdit={filePathForEditorDialog}
          />
        )}

      <UIDialog open={isCreateItemDialogOpen} onOpenChange={setIsCreateItemDialogOpen}>
        <UIDialogContent className="sm:max-w-md rounded-2xl backdrop-blur-sm">
          <UIDialogHeader>
            <UIDialogTitle>Create New {createItemType === 'file' ? 'File' : 'Folder'}</UIDialogTitle>
            <UIDialogDesc>
              Enter the name for the new {createItemType} in <span className="font-mono text-sm">{currentPath}</span>.
            </UIDialogDesc>
          </UIDialogHeader>
          <div className="py-4">
            <Label htmlFor="newItemName" className="sr-only">Name</Label>
            <Input
              id="newItemName"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={createItemType === 'file' ? 'e.g., new-file.txt' : 'e.g., new-folder'}
              onKeyDown={(e) => e.key === 'Enter' && !isCreatingItem && handleCreateItem()}
            />
          </div>
          <UIDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isCreatingItem}>
                <X className="mr-2 h-4 w-4" /> Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleCreateItem} disabled={isCreatingItem || !newItemName.trim()} className="shadow-md hover:scale-105 transform transition-transform duration-150">
              {isCreatingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (createItemType === 'file' ? <FilePlus className="mr-2 h-4 w-4"/> : <FolderPlus className="mr-2 h-4 w-4"/>)}
              Create
            </Button>
          </UIDialogFooter>
        </UIDialogContent>
      </UIDialog>
    </div>
  );
}

