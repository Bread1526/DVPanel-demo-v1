// src/app/api/panel-daemon/files/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the base directory for file operations.
// Reads from environment variable FILE_MANAGER_BASE_DIR, defaults to '/'
// WARNING: Defaulting to '/' can be a security risk. Ensure the Next.js server process
// has appropriately restricted permissions or set FILE_MANAGER_BASE_DIR in .env.local
// to a specific, safer directory (e.g., /srv/www).
const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';

console.log(`[API /panel-daemon/files] Using BASE_DIR: ${BASE_DIR}`);


function resolveSafePath(relativePath: string): string {
  // Normalize the relative path to resolve ".." and "." segments.
  const normalizedRelativePath = path.normalize(relativePath);

  // Prevent paths that try to go above the root of the relative path structure
  // (e.g., if relativePath itself starts with '../' after normalization).
  if (normalizedRelativePath.startsWith('..') || normalizedRelativePath.includes(path.sep + '..')) {
    console.error(
      `[API Security] Access Denied (Invalid Path Structure): relativePath='${relativePath}', normalizedRelativePath='${normalizedRelativePath}'`
    );
    throw new Error('Access denied: Invalid path structure.');
  }

  // Join with BASE_DIR and normalize again for the final absolute path
  const absolutePath = path.normalize(path.join(BASE_DIR, normalizedRelativePath));

  // Final security check: ensure the resolved path is still within or at BASE_DIR
  // Account for BASE_DIR being '/' itself.
  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) { // Should always be absolute after path.join with absolute BASE_DIR
         console.error(
            `[API Security] Access Denied (Path not absolute - Files): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
         );
        throw new Error('Access denied: Resolved path is not absolute.');
    }
    // If BASE_DIR is root, any absolute path is "within" it. Further OS-level permissions will apply.
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
     console.error(
      `[API Security] Access Denied (Outside Base Directory - Files): relativePath='${relativePath}', normalizedRelativePath='${normalizedRelativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  return absolutePath;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path') || '/'; // Default to logical root relative to BASE_DIR

  try {
    const dirPath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/files] Attempting to list directory: ${dirPath} (requested relative: ${requestedPath})`);

    if (!fs.existsSync(dirPath)) {
      console.warn(`[API /panel-daemon/files] Path not found: ${dirPath}`);
      return NextResponse.json({ error: 'Path not found.', details: `Path: ${dirPath}` }, { status: 404 });
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      console.warn(`[API /panel-daemon/files] Path is not a directory: ${dirPath}`);
      return NextResponse.json({ error: 'Path is not a directory.', details: `Path: ${dirPath}` }, { status: 400 });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
    }));

    // Return the logical path the client requested for consistency
    // Ensure it's a clean, forward-slash path starting with /
    const clientPath = ('/' + requestedPath).replace(/\/+/g, '/');
    
    console.log(`[API /panel-daemon/files] Successfully listed ${result.length} entries for clientPath: ${clientPath}`);
    return NextResponse.json({ path: clientPath, files: result });

  } catch (error: any) {
    console.error('[API /panel-daemon/files] Error listing files:', error);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Requested path: ${requestedPath}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list files.', details: error.message }, { status: 500 });
  }
}
