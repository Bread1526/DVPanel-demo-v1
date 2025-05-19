
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CodeEditor from '@/components/ui/code-editor';
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ArrowLeft, AlertTriangle } from "lucide-react";
import { cn } from '@/lib/utils';

const DAEMON_API_BASE_PATH = '/api/panel-daemon';

// Helper function to determine language from filename
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

export default function FileEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  // The filePath param will be an array of segments if the path has slashes
  // We need to decode it and join it back
  const encodedFilePathArray = params.filePath as string[] | undefined;
  const filePath = useMemo(() => {
    if (!encodedFilePathArray || encodedFilePathArray.length === 0) return null;
    // The dynamic route [...filePath] gives an array, but we passed a single encoded string.
    // So, encodedFilePathArray should have one element which is the URI encoded full path.
    try {
      return decodeURIComponent(encodedFilePathArray[0]);
    } catch (e) {
      console.error("Error decoding file path from URL:", e);
      return null; // Or handle error appropriately
    }
  }, [encodedFilePathArray]);
  
  const fileName = useMemo(() => filePath ? filePath.split('/').pop() : 'Unknown File', [filePath]);

  const [fileContent, setFileContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [language, setLanguage] = useState<string>("plaintext");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<boolean>(false);

  const fetchFileContent = useCallback(async (pathToFile: string) => {
    console.log("[FileEditorPage] fetchFileContent CALLED for path:", pathToFile);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file?path=${encodeURIComponent(pathToFile)}&view=true`);
      if (!response.ok) {
        let errorMsg = `Error fetching file: ${response.status}`;
        try {
          const errData = await response.json();
          errorMsg = errData.error || errData.details || errorMsg;
        } catch (parseError) {
          // Try to get text if JSON parsing fails
          errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }
      const textContent = await response.text();
      setFileContent(textContent);
      setOriginalContent(textContent);
      setLanguage(getLanguageFromFilename(pathToFile));
      setUnsavedChanges(false);
      console.log("[FileEditorPage] File content fetched successfully for:", pathToFile);
    } catch (e: any) {
      console.error("[FileEditorPage] Error fetching file content:", e);
      setError(e.message || "Failed to load file content.");
      toast({ title: "Error Loading File", description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (filePath) {
      console.log("[FileEditorPage] useEffect - filePath identified:", filePath);
      fetchFileContent(filePath);
    } else if (encodedFilePathArray) { // If filePath is null due to decoding error but we have the raw params
      console.error("[FileEditorPage] useEffect - Invalid file path after decoding. Raw params:", encodedFilePathArray);
      setError("Invalid file path in URL.");
      setIsLoading(false);
    }
  }, [filePath, fetchFileContent, encodedFilePathArray]);

  const handleContentChange = useCallback((newContent: string) => {
    setFileContent(newContent);
    setUnsavedChanges(newContent !== originalContent);
  }, [originalContent]);

  const handleSaveFile = useCallback(async () => {
    if (!filePath) {
      toast({ title: "Error", description: "No file path specified.", variant: "destructive" });
      return;
    }
    console.log("[FileEditorPage] handleSaveFile CALLED for path:", filePath);
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`${DAEMON_API_BASE_PATH}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: fileContent }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to save file.');
      }
      toast({ title: 'Success', description: result.message || `File ${fileName} saved.` });
      setOriginalContent(fileContent); // Update original content to reflect saved state
      setUnsavedChanges(false);
      console.log("[FileEditorPage] File saved successfully:", filePath);
    } catch (e: any) {
      console.error("[FileEditorPage] Error saving file:", e);
      setError(e.message || "An unexpected error occurred while saving.");
      toast({ title: "Error Saving File", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [filePath, fileContent, fileName, toast]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Standard for most browsers
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [unsavedChanges]);


  if (!filePath && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive p-8">
        <AlertTriangle className="h-16 w-16 mb-4" />
        <h2 className="text-2xl font-semibold">Invalid File Path</h2>
        <p className="text-muted-foreground">The file path in the URL is invalid or missing.</p>
        <Button onClick={() => router.push('/files')} className="mt-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to File Manager
        </Button>
      </div>
    );
  }
  
  const pageTitle = isLoading ? "Loading Editor..." : `Edit File: ${fileName || 'Unknown'}${unsavedChanges ? "*" : ""}`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={pageTitle}
        description={filePath || "No file selected"}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => router.push('/files')} variant="outline" className="shadow-md hover:scale-105">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
            </Button>
            <Button onClick={handleSaveFile} disabled={isSaving || !unsavedChanges || isLoading} className="shadow-md hover:scale-105">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        }
      />

      <Card className="flex-grow flex flex-col overflow-hidden shadow-lg rounded-2xl">
        <CardContent className="flex-grow p-0 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex-grow flex justify-center items-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground text-lg">Loading file content...</p>
            </div>
          ) : error ? (
            <div className="flex-grow flex flex-col justify-center items-center text-destructive p-6 bg-destructive/10">
              <AlertTriangle className="h-12 w-12 mb-3" />
              <p className="font-semibold text-lg">Error Loading File</p>
              <p className="text-sm text-center mb-4">{error}</p>
              <Button onClick={() => filePath && fetchFileContent(filePath)} variant="outline">
                Retry
              </Button>
            </div>
          ) : (
            <CodeEditor
              value={fileContent}
              onChange={handleContentChange}
              language={language}
              readOnly={isSaving}
              className="h-full w-full border-0 rounded-none" // Ensure editor takes full space of parent
            />
          )}
        </CardContent>
      </Card>
       {filePath && (
        <div className="p-2 border-t text-xs text-muted-foreground flex justify-between bg-card rounded-b-2xl">
            <div>Path: <span className="font-mono">{filePath}</span></div>
            <div>Lang: {language} Chars: {fileContent.length} Lines: {fileContent.split('\n').length} {unsavedChanges ? <span className="text-amber-500 font-semibold ml-2">* Unsaved</span> : <span className="text-green-500 font-semibold ml-2">Saved</span>}</div>
        </div>
       )}
    </div>
  );
}
