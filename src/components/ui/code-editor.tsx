
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
// import { shell } from '@codemirror/lang-shell'; // Removed shell import
import { oneDark } from '@codemirror/theme-one-dark'; 
import { EditorView } from '@codemirror/view'; 
import { cn } from '@/lib/utils';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  className?: string;
  height?: string; 
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'plaintext',
  readOnly = false,
  className,
  height = '100%', 
}) => {
  const [extensions, setExtensions] = useState<any[]>([]);

  useEffect(() => {
    const commonExtensions = [
      oneDark, 
      EditorView.lineWrapping, 
    ];
    
    let langExtension;
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'jsx':
      case 'typescript':
      case 'tsx':
        langExtension = javascript({ jsx: true, typescript: true });
        break;
      case 'html':
      case 'htm':
        langExtension = html();
        break;
      case 'css':
      case 'scss': 
        langExtension = css();
        break;
      case 'json':
        langExtension = json();
        break;
      case 'python':
      case 'py':
        langExtension = python();
        break;
      // case 'shell': // Removed shell cases
      // case 'bash':
      // case 'sh':
      //   langExtension = shell();
      //   break;
      default:
        // For plaintext or unknown, use JavaScript as a fallback for basic highlighting
        langExtension = javascript({ jsx: true, typescript: true }); 
    }
    
    setExtensions([langExtension, ...commonExtensions]);

  }, [language]);
  
  const handleEditorChange = useCallback(
    (val: string) => {
      if (!readOnly) {
        onChange(val);
      }
    },
    [onChange, readOnly]
  );

  return (
    <div className={cn("h-full w-full border border-input rounded-md overflow-hidden", className)}
         style={{backgroundColor: 'hsl(var(--muted))'}} 
    >
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={handleEditorChange}
        readOnly={readOnly}
        theme={oneDark} 
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: true,
          closeBrackets: true,
        }}
        className="h-full w-full text-sm" 
      />
    </div>
  );
};

export default CodeEditor;
