
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Folder, File as FileIcon, Upload, Download, Edit3, Trash2, KeyRound, Search, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useToast } from "@/hooks/use-toast";
import path from 'path-browserify'; // Using path-browserify for client-side path manipulation

interface FileItem {
  name: string;
  type: 'folder' | 'file';
  // Other properties like size, modified, permissions can be added if daemon provides them
  size?: string;
  modified?: string;
  permissions?: string;
}

// The daemon functionality is now part of the Next.js app via API routes
const DAEMON_API_BASE_PATH = '/api/panel-daemon';

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

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
          console.error("Failed to parse error response from daemon API:", parseError);
          errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (data && Array.isArray(data.files)) {
        setFiles(data.files.map((f: any) => ({
          name: f.name,
          type: f.type,
          size: 'N/A', // Placeholder
          modified: 'N/A', // Placeholder
          permissions: 'N/A', // Placeholder
        })));
        setCurrentPath(data.path || pathToFetch); // Trust the path returned by API
      } else {
        setFiles([]);
        setCurrentPath(data.path || pathToFetch);
        if (!Array.isArray(data.files)) {
          console.warn("Daemon API did not return a 'files' array. Response:", data);
          // Potentially setError("Received malformed data from server.")
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
    const newPath = '/' + segments.slice(0, index +1).join('/');
    // Adjust for root click
    if (index === -1 && segments.length > 0) {
         setCurrentPath('/');
    } else if (index === -1 && segments.length === 0) {
        setCurrentPath('/');
    }
    else {
        setCurrentPath(newPath.replace(/\\/g, '/'));
    }
  };

  const getBreadcrumbSegments = () => {
    if (currentPath === '/') return [{ name: 'Root', path: '/' }];
    const segments = currentPath.split('/').filter(Boolean);
    return [{ name: 'Root', path: '/' }, ...segments.map((segment, index) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/'),
    }))];
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <PageHeader 
        title="Root File Manager" 
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
                {filteredFiles.map((file) => (
                  <TableRow 
                    key={file.name} // Assuming names are unique within a directory for key
                    onDoubleClick={file.type === 'folder' ? () => handleFolderClick(file.name) : undefined}
                    className={file.type === 'folder' ? 'cursor-pointer hover:bg-muted/50' : ''}
                  >
                    <TableCell>
                      {file.type === 'folder' ? <Folder className="h-5 w-5 text-primary" /> : <FileIcon className="h-5 w-5 text-muted-foreground" />}
                    </TableCell>
                    <TableCell 
                      className="font-medium"
                      onClick={file.type === 'folder' ? () => handleFolderClick(file.name) : undefined}
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
                          {file.type === 'file' && <DropdownMenuItem><Download className="mr-2 h-4 w-4" /> Download</DropdownMenuItem>}
                          <DropdownMenuItem><Edit3 className="mr-2 h-4 w-4" /> Edit / Rename</DropdownMenuItem>
                          <DropdownMenuItem><KeyRound className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
