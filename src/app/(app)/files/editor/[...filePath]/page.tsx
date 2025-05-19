
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor'; // Default import
import { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ArrowLeft, Camera, Search as SearchIcon, FileWarning } from "lucide-react";
import path from 'path-browserify';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { openSearchPanel } from '@codemirror/search';
import Image from 'next/image'; // Import next/image
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

function isImageExtension(filename: string): boolean {
  if (!filename) return false;
  const extension = path.extname(filename).toLowerCase();
  return imageExtensions.includes(extension);
}

// Helper function to get language from filename
function getLanguageFromFilename(filename: string): string {
  if (!filename) return 'plaintext';
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'html': case 'htm': return 'html';
    case 'css': case 'scss': return 'css';
    case 'json': return 'json';
    case 'yaml': case 'yml': return 'yaml'; // Updated to 'yaml' for CodeMirror
    case 'md': return 'markdown';
    case 'sh': case 'bash': return 'shell';
    case 'py': return 'python';
    default: return 'plaintext';
  }
}

export default function FileEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const [fileContent, setFileContent] = useState<string>('');
  const [originalFileContent, setOriginalFileContent] = useState<string>('');
  const [isWritable, setIsWritable] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isImageFile, setIsImageFile] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);


  const encodedFilePathFromParams = params.filePath;

  const decodedFilePath = useMemo(() => {
    const pathArray = Array.isArray(encodedFilePathFromParams) ? encodedFilePathFromParams : [encodedFilePathFromParams];
    const joinedPath = pathArray.join('/');
    if (!joinedPath) return '';
    try {
      return decodeURIComponent(joinedPath);
    } catch (e) {
      console.error("Failed to decode file path:", e);
      return '';
    }
  }, [encodedFilePathFromParams]);

  const fileName = useMemo(() => path.basename(decodedFilePath || 'Untitled'), [decodedFilePath]);
  const fileLanguage = useMemo(() => getLanguageFromFilename(fileName), [fileName]);
  const hasUnsavedChanges = useMemo(() => fileContent !== originalFileContent, [fileContent, originalFileContent]);

  const DAEMON_API_BASE_PATH = '/api/panel-daemon';

  const fetchFileContent = useCallback(async () => {
    if (!decodedFilePath) {
      setError("File path is invalid or missing.");
      setIsLoading(false);
      return;
    }

    const isImage = isImageExtension(fileName);
    setIsImageFile(isImage);
    setIsLoading(true);
    setError(null);
    setImageError(null);

    if (isImage) {
      // For images, we don't fetch content for the editor,
      // but we still need to check writability from the view=true endpoint.
      // The actual image will be loaded by the <Image> tag using the direct file endpoint.
      try {
        const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`); // Fetch metadata like writability
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: `Error fetching image metadata: ${response.statusText}` }));
          throw new Error(errData.error || `Failed to fetch image metadata. Status: ${response.status}`);
        }
        const data = await response.json();
        if (typeof data.writable !== 'boolean') {
          throw new Error("Invalid response format from server when fetching image metadata.");
        }
        setIsWritable(data.writable);
      } catch (e: any) {
        setError(e.message || "An unexpected error occurred while fetching image metadata.");
        toast({ title: "Error Loading Image Info", description: e.message, variant: "destructive" });
        setIsWritable(false); // Assume not writable on error
      } finally {
        setIsLoading(false);
      }
      return; // No need to fetch content for editor if it's an image
    }

    // For non-image files, fetch content for the editor
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching file: ${response.statusText}`, details: `Path: ${decodedFilePath}` }));
        throw new Error(errData.error || `Failed to fetch file content. Status: ${response.status}`);
      }
      const data = await response.json();
      if (typeof data.content !== 'string' || typeof data.writable !== 'boolean') {
        throw new Error("Invalid response format from server when fetching file content.");
      }
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      setIsWritable(data.writable);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while fetching file content.");
      toast({ title: "Error Loading File", description: e.message, variant: "destructive" });
      setIsWritable(false);
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, fileName, toast]);

  useEffect(() => {
    if (decodedFilePath) {
      fetchFileContent();
    } else if (encodedFilePathFromParams) {
      setIsLoading(false);
      setError("Invalid file path parameter.");
      toast({title: "Error", description: "Invalid file path provided in URL.", variant: "destructive"});
    } else {
        setIsLoading(false);
        setError("No file path provided in URL.");
    }
  }, [decodedFilePath, encodedFilePathFromParams, fetchFileContent, toast]);

  const handleSaveChanges = useCallback(async () => {
    if (isImageFile) {
      toast({ title: "Info", description: "Image editing is not supported directly here." });
      return;
    }
    if (!decodedFilePath) {
      toast({ title: "Error", description: "No active file to save.", variant: "destructive" });
      return;
    }
    if (!isWritable) {
      toast({ title: "Cannot Save", description: "This file is not writable.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: decodedFilePath, content: fileContent }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to save file.');
      }
      toast({ title: 'Success', description: result.message || `File ${fileName} saved.` });
      setOriginalFileContent(fileContent);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while saving.");
      toast({ title: "Error Saving File", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [decodedFilePath, fileContent, fileName, isWritable, toast, isImageFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (!isImageFile && !isSaving && isWritable && hasUnsavedChanges) {
          handleSaveChanges();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, isWritable, hasUnsavedChanges, handleSaveChanges, isImageFile]);

  const handleFind = useCallback(() => {
    if (isImageFile) return;
    if (editorRef.current && editorRef.current.view) {
        editorRef.current.view.dispatch({ effects: openSearchPanel.of() });
    } else {
      toast({
        title: "Find Action",
        description: "Editor not ready or use Ctrl+F (Cmd+F).",
      });
    }
  }, [toast, isImageFile]);

  const handleCreateSnapshot = useCallback(() => {
    if (isImageFile) return;
    console.log("SNAPSHOT CREATED (Placeholder):", { path: decodedFilePath, content: fileContent, timestamp: new Date().toISOString() });
    toast({
      title: "Snapshot Created (Placeholder)",
      description: "File content logged to browser console. Full snapshot functionality pending.",
    });
  }, [decodedFilePath, fileContent, toast, isImageFile]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading file...</p>
      </div>
    );
  }
  
  if (error && !isLoading && !isImageFile) { // Only show generic error if not an image that might have its own error
    return (
      <div className="p-4">
        <PageHeader title="Error Loading File" description={error} />
        <Button onClick={() => router.push('/files')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }

  if (!decodedFilePath && !isLoading) {
     return (
      <div className="p-4">
        <PageHeader title="Invalid File Path" description="The file path specified in the URL is invalid or missing." />
        <Button onClick={() => router.push('/files')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }

  const imageUrl = `${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath || '')}`;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-var(--header-height,6rem)-2rem)]">
      <PageHeader
        title={`${fileName}`}
        description={<span className="font-mono text-xs break-all">{decodedFilePath}</span>}
        actions={
          <Button onClick={() => router.push('/files')} variant="outline" className="shadow-md hover:scale-105">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
          </Button>
        }
      />
      
      {!isImageFile && (
        <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSaveChanges} 
              disabled={isSaving || !isWritable || !hasUnsavedChanges} 
              className="shadow-sm hover:scale-105"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleFind}
              className="shadow-sm hover:scale-105"
            >
              <SearchIcon className="mr-2 h-4 w-4" /> Find
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="shadow-sm hover:scale-105"
                >
                  <Camera className="mr-2 h-4 w-4" /> Snapshots
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={handleCreateSnapshot}>
                  Create Snapshot
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">
                  (Snapshots will expire after 3 new ones are above that snapshot and it has been 3 weeks unless marked as locked)
                </DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mr-2">
            <span>Lang: {fileLanguage}</span>
            <span className="mx-1">|</span>
            <span>Chars: {fileContent.length}</span>
            <span className="mx-1">|</span>
            <span>Lines: {fileContent.split('\n').length}</span>
            {hasUnsavedChanges && <span className="ml-1 font-semibold text-amber-500">* Unsaved</span>}
            {!isWritable && <span className="ml-2 font-semibold text-destructive">(Read-only)</span>}
          </div>
        </div>
      )}

      {isImageFile ? (
        <div className="flex-grow flex flex-col items-center justify-center p-4 bg-background">
          {isLoading ? (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          ) : error ? ( // Error specific to image loading after metadata check
             <div className="p-4 text-center">
                <AlertTitle>Error Loading Image</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
             </div>
          ) : (
            <>
              <div className="relative w-full max-w-4xl h-auto aspect-auto max-h-[70vh] shadow-lg rounded-md overflow-hidden border">
                <Image
                  src={imageUrl}
                  alt={`Image preview for ${fileName}`}
                  layout="fill"
                  objectFit="contain"
                  unoptimized // Useful if your API endpoint doesn't support Next.js image optimization headers
                  onError={() => setImageError("Failed to load image. The file might be corrupted or not a valid image.")}
                  data-ai-hint="file preview"
                />
              </div>
              {imageError && (
                <Alert variant="destructive" className="mt-4 max-w-4xl">
                  <FileWarning className="h-4 w-4" />
                  <AlertTitle>Image Display Error</AlertTitle>
                  <AlertDescription>{imageError}</AlertDescription>
                </Alert>
              )}
               {!isWritable && (
                <Alert variant="destructive" className="mt-4 max-w-4xl">
                    <FileWarning className="h-4 w-4" />
                    <AlertTitle>Read-only</AlertTitle>
                    <AlertDescription>This file is not writable (permissions might be restricted on the server).</AlertDescription>
                </Alert>
                )}
            </>
          )}
        </div>
      ) : (
        <>
          {!isWritable && (
            <Alert variant="destructive" className="m-2 rounded-md">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Read-only Mode</AlertTitle>
              <AlertDescription>
                This file is not writable. Changes cannot be saved.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex-grow relative p-0 bg-background min-h-0">
            <CodeEditor
              ref={editorRef}
              value={fileContent}
              onChange={setFileContent}
              language={fileLanguage}
              readOnly={isSaving || !isWritable}
              className="h-full w-full border-0 rounded-none" // Ensure editor takes full height
            />
          </div>
        </>
      )}
    </div>
  );
}
