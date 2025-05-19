
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import CodeEditor from '@/components/ui/code-editor'; 
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ArrowLeft, Camera, Search as SearchIcon, ShieldAlert } from "lucide-react";
import path from 'path-browserify';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Helper function to get language from filename
function getLanguageFromFilename(filename: string): string {
  if (!filename) return 'plaintext';
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'js': case 'jsx': return 'javascript'; // jsx: true will be handled by CodeMirror
    case 'ts': case 'tsx': return 'typescript'; // tsx: true will be handled by CodeMirror
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

export default function FileEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [fileContent, setFileContent] = useState<string>('');
  const [originalFileContent, setOriginalFileContent] = useState<string>('');
  const [isWritable, setIsWritable] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const encodedFilePathFromParams = params.filePath;
  const encodedFilePath = useMemo(() => {
    return Array.isArray(encodedFilePathFromParams) ? encodedFilePathFromParams.join('/') : encodedFilePathFromParams;
  }, [encodedFilePathFromParams]);

  const decodedFilePath = useMemo(() => {
    if (!encodedFilePath) return '';
    try {
      return decodeURIComponent(encodedFilePath);
    } catch (e) {
      console.error("Failed to decode file path:", e);
      return '';
    }
  }, [encodedFilePath]);

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
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(decodedFilePath)}&view=true`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: `Error fetching file: ${response.statusText}`, details: `Path: ${decodedFilePath}` }));
        throw new Error(errData.error || `Failed to fetch file content. Status: ${response.status}`);
      }
      const data = await response.json(); // Expect { content: string, writable: boolean }
      if (typeof data.content !== 'string' || typeof data.writable !== 'boolean') {
        throw new Error("Invalid response format from server when fetching file content.");
      }
      setFileContent(data.content);
      setOriginalFileContent(data.content);
      setIsWritable(data.writable);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while fetching file content.");
      toast({ title: "Error Loading File", description: e.message, variant: "destructive" });
      setIsWritable(false); // Assume not writable on error
    } finally {
      setIsLoading(false);
    }
  }, [decodedFilePath, toast]);

  useEffect(() => {
    if (decodedFilePath) {
      fetchFileContent();
    } else if (encodedFilePath) { // If encodedFilePath exists but decoded is empty (due to error)
      setIsLoading(false);
      setError("Invalid file path parameter.");
      toast({title: "Error", description: "Invalid file path provided in URL.", variant: "destructive"});
    } else {
        setIsLoading(false);
        setError("No file path provided in URL.");
    }
  }, [decodedFilePath, encodedFilePath, fetchFileContent, toast]);

  const handleSaveChanges = useCallback(async () => {
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
  }, [decodedFilePath, fileContent, fileName, isWritable, toast]);

  // Keyboard shortcut for Save (Ctrl+S or Cmd+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (!isSaving && isWritable && hasUnsavedChanges) {
          handleSaveChanges();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, isWritable, hasUnsavedChanges, handleSaveChanges]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-10rem)]"> {/* Adjust height as needed */}
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading file content...</p>
      </div>
    );
  }
  
  if (error && !isLoading) { // Ensure error is shown only after loading finishes
    return (
      <div className="p-4">
        <PageHeader title="Error Loading File" description={error} />
        <Button onClick={() => router.push('/files')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }

  if (!decodedFilePath && !isLoading) { // Handle case where decodedFilePath is empty after loading
     return (
      <div className="p-4">
        <PageHeader title="Invalid File Path" description="The file path specified in the URL is invalid or missing." />
        <Button onClick={() => router.push('/files')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }


  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-var(--header-height,6rem)-2rem)]"> {/* Adjust overall height */}
      <PageHeader
        title={`${fileName}`}
        description={<span className="font-mono text-xs break-all">{decodedFilePath}</span>}
        actions={
          <Button onClick={() => router.push('/files')} variant="outline" className="shadow-md hover:scale-105">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
          </Button>
        }
      />
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between p-2 border-b bg-muted/50">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleSaveChanges} disabled={isSaving || !isWritable || !hasUnsavedChanges} className="shadow-sm hover:scale-105">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toast({ title: "Find Action", description: "Find in file functionality coming soon!" })} className="shadow-sm hover:scale-105">
            <SearchIcon className="mr-2 h-4 w-4" /> Find
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toast({ title: "Snapshots Action", description: "File snapshots functionality coming soon!" })} className="shadow-sm hover:scale-105">
            <Camera className="mr-2 h-4 w-4" /> Snapshots
          </Button>
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

      {!isWritable && (
        <Alert variant="destructive" className="m-2 rounded-md">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Read-only Mode</AlertTitle>
          <AlertDescription>
            This file is not writable. Changes cannot be saved.
          </AlertDescription>
        </Alert>
      )}

      {/* Code Editor Area */}
      <div className="flex-grow relative p-0 bg-background min-h-0">
        <CodeEditor
          value={fileContent}
          onChange={setFileContent}
          language={fileLanguage}
          readOnly={isSaving || !isWritable}
          className="h-full w-full border-0 rounded-none"
        />
      </div>
    </div>
  );
}
