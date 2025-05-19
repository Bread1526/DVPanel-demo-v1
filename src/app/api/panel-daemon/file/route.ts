// src/app/api/panel-daemon/file/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the base directory for file operations.
// Reads from environment variable FILE_MANAGER_BASE_DIR, defaults to '/'
// WARNING: Defaulting to '/' can be a security risk. Ensure the Next.js server process
// has appropriately restricted permissions or set FILE_MANAGER_BASE_DIR in .env.local
// to a specific, safer directory (e.g., /srv/www).
const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';

console.log(`[API /panel-daemon/file] Using BASE_DIR: ${BASE_DIR}`);

function resolveSafePath(relativePath: string): string {
  // Normalize the relative path to resolve ".." and "." segments.
  const normalizedRelativePath = path.normalize(relativePath);

  // Prevent paths that try to go above the root of the relative path structure
  if (normalizedRelativePath.startsWith('..') || normalizedRelativePath.includes(path.sep + '..')) {
     console.error(
      `[API Security] Access Denied (Invalid Path Structure - File): relativePath='${relativePath}', normalizedRelativePath='${normalizedRelativePath}'`
    );
    throw new Error('Access denied: Invalid path structure.');
  }

  // Join with BASE_DIR and normalize again for the final absolute path
  const absolutePath = path.normalize(path.join(BASE_DIR, normalizedRelativePath));

  // Final security check: ensure the resolved path is still within or at BASE_DIR
  // Account for BASE_DIR being '/' itself.
  if (BASE_DIR === '/') {
     if (!path.isAbsolute(absolutePath)) {
         console.error(
            `[API Security] Access Denied (Path not absolute - File): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
         );
        throw new Error('Access denied: Resolved path is not absolute.');
    }
    // If BASE_DIR is root, any absolute path is "within" it. Further OS-level permissions will apply.
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(
      `[API Security] Access Denied (Outside Base Directory - File): relativePath='${relativePath}', normalizedRelativePath='${normalizedRelativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  return absolutePath;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path');

  if (!requestedPath) {
    return NextResponse.json({ error: 'File path query parameter is required.' }, { status: 400 });
  }

  try {
    const filePath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/file] Attempting to read file: ${filePath} (requested relative: ${requestedPath})`);


    if (!fs.existsSync(filePath)) {
      console.warn(`[API /panel-daemon/file] File not found: ${filePath}`);
      return NextResponse.json({ error: 'File not found.', details: `Path: ${filePath}` }, { status: 404 });
    }
    if (fs.statSync(filePath).isDirectory()) {
      console.warn(`[API /panel-daemon/file] Path is a directory, not a file: ${filePath}`);
      return NextResponse.json({ error: 'Path is a directory, not a file.', details: `Path: ${filePath}` }, { status: 400 });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`[API /panel-daemon/file] Successfully read file: ${filePath}`);
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error: any) {
    console.error('[API /panel-daemon/file] Error reading file:', error);
     if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Requested path: ${requestedPath}` }, { status: 403 });
    }
    if (error.message.startsWith('File path is required')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to read file.', details: error.message }, { status: 500 });
  }
}
