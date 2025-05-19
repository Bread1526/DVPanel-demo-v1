
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string; 
  readOnly?: boolean;
  className?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  readOnly = false,
  className,
}) => {
  const [lineNumbers, setLineNumbers] = useState<string>("1");
  const linesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const calculateLineNumbers = useCallback((textValue: string) => {
    const lines = textValue.split('\\n').length;
    const numbers = Array.from({ length: Math.max(1, lines) }, (_, i) => i + 1).join('\\n');
    setLineNumbers(numbers);
  }, []);

  useEffect(() => {
    calculateLineNumbers(value);
  }, [value, calculateLineNumbers]);

  const handleTextareaScroll = () => {
    if (linesRef.current && textareaRef.current) {
      linesRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };
  
  const handleTextareaInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    // Recalculate line numbers on input as well
    calculateLineNumbers(event.target.value); 
  };


  // Basic language detection for placeholder
  const detectedLanguage = language || 'plaintext';

  return (
    <div className={cn("flex h-full w-full bg-background font-mono text-sm border border-input rounded-md overflow-hidden", className)}>
      <div
        ref={linesRef}
        className="line-numbers sticky left-0 top-0 h-full select-none overflow-y-hidden whitespace-pre-wrap bg-muted p-2 pr-3 text-right text-muted-foreground no-scrollbar"
        style={{ 
          lineHeight: '1.625rem', /* Match textarea's leading-relaxed roughly */
          minWidth: '40px',
          paddingTop: '0.5rem', /* Align with textarea's p-2 */
          paddingBottom: '0.5rem' 
        }}
        aria-hidden="true"
      >
        {lineNumbers}
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaInput} // Use combined handler
        onScroll={handleTextareaScroll}
        readOnly={readOnly}
        className="h-full flex-grow resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-2 bg-transparent leading-relaxed tracking-wide no-scrollbar"
        placeholder={`Enter ${detectedLanguage} code here... (Syntax highlighting not yet implemented)`}
        spellCheck="false"
        wrap="off" 
      />
    </div>
  );
};

export default CodeEditor;

    