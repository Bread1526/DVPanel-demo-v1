
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
// Shell language support was removed due to npm install issues.
// If you resolve the npm issue for @codemirror/lang-shell, you can re-add it:
// import { shell } from '@codemirror/lang-shell';
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
      oneDark, // Apply the One Dark theme
      EditorView.lineWrapping, // Enable line wrapping
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
      // case 'shell': // Shell cases removed due to previous npm install issues
      // case 'bash':
      // case 'sh':
      //   langExtension = shell();
      //   break;
      default:
        // For plaintext or unknown, use JavaScript as a fallback for basic structure
        langExtension = javascript({ jsx: false, typescript: false });
        break;
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
         style={{backgroundColor: 'hsl(var(--muted))'}} // Ensures editor background matches muted theme
    >
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={handleEditorChange}
        readOnly={readOnly}
        // The theme is applied via the extensions array (oneDark)
        // basicSetup prop enables a set of common editor features
        basicSetup={{
          lineNumbers: true,               // Show line numbers
          highlightActiveLineGutter: true, // Highlight the gutter of the active line
          highlightSpecialChars: true,     // Highlight special characters
          history: true,                   // Enable undo/redo history
          foldGutter: true,                // Show the gutter for code folding (Feature 12 - UI part)
          drawSelection: true,             // Enable custom drawing of selection
          dropCursor: true,                // Show a cursor at the drop position when dragging
          allowMultipleSelections: true,   // Allow multiple cursors/selections
          indentOnInput: true,             // Auto-indent on input
          syntaxHighlighting: true,        // Enable syntax highlighting (works with language extensions)
          bracketMatching: true,           // Highlight matching brackets (Feature 11)
          closeBrackets: true,             // Auto-close brackets
          autocompletion: true,            // Enable basic autocompletion
          rectangularSelection: true,      // Enable rectangular selection
          crosshairCursor: true,           // Show a crosshair cursor
          highlightActiveLine: true,       // Highlight the current active line (Feature 8)
          highlightSelectionMatches: true, // Highlight other occurrences of the selected text

          // Keymaps for common actions
          defaultKeymap: true,             // Standard keybindings
          searchKeymap: true,              // Keybindings for search (Ctrl/Cmd-F)
          historyKeymap: true,             // Keybindings for undo/redo
          foldKeymap: true,                // Keybindings for code folding (Feature 12 - keyboard part)
          completionKeymap: true,          // Keybindings for autocompletion
          lintKeymap: true,                // Keybindings for linting (if linting is configured)
        }}
        className="h-full w-full text-sm" // Ensure editor takes full height and width
      />
    </div>
  );
};

export default CodeEditor;
