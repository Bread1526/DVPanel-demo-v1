
// src/app/api/panel-daemon/files/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define the base directory for file operations.
// WARNING: Ensure this path is correctly configured and secured in a real application.
// The Next.js server process needs read access to this directory.
const BASE_DIR = '/srv/www'; // Or a more configurable path

function resolveSafePath(userPath: string | undefined | null): string {
  // Normalize and resolve the user-provided path relative to BASE_DIR
  const resolvedPath = path.resolve(BASE_DIR, userPath || '.');

  // Security check: Ensure the resolved path is still within the BASE_DIR
  if (!resolvedPath.startsWith(path.resolve(BASE_DIR))) {
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  return resolvedPath;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path') || '/'; // Default to root of BASE_DIR

  try {
    const dirPath = resolveSafePath(requestedPath);

    if (!fs.existsSync(dirPath)) {
      return NextResponse.json({ error: 'Path not found.' }, { status: 404 });
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory.' }, { status: 400 });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
    }));

    // Return the relative path from BASE_DIR for consistency with client expectations
    const relativePath = path.relative(path.resolve(BASE_DIR), dirPath) || '/';
    
    return NextResponse.json({ path: path.join('/', relativePath).replace(/\\/g, '/'), files: result });

  } catch (error: any) {
    console.error('[API /panel-daemon/files] Error listing files:', error);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list files.', details: error.message }, { status: 500 });
  }
}
