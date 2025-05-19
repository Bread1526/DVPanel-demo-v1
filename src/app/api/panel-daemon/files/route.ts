
// src/app/api/panel-daemon/files/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the base directory for file operations.
// WARNING: Ensure this path is correctly configured and secured in a real application.
// The Next.js server process needs read access to this directory.
const BASE_DIR = '/srv/www'; // Or a more configurable path, ensure it's absolute.

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
  if (!absolutePath.startsWith(BASE_DIR)) {
    console.error(
      `[API Security] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedRelativePath='${normalizedRelativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  return absolutePath;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path') || '/'; // Default to logical root

  try {
    const dirPath = resolveSafePath(requestedPath);

    if (!fs.existsSync(dirPath)) {
      return NextResponse.json({ error: 'Path not found.', details: `Path: ${dirPath}` }, { status: 404 });
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory.', details: `Path: ${dirPath}` }, { status: 400 });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
    }));

    // Return the logical path the client requested for consistency
    const clientPath = path.join('/', requestedPath).replace(/\\/g, '/');
    
    return NextResponse.json({ path: clientPath, files: result });

  } catch (error: any) {
    console.error('[API /panel-daemon/files] Error listing files:', error);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list files.', details: error.message }, { status: 500 });
  }
}
