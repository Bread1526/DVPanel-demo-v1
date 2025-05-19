
// src/app/api/panel-daemon/file/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/srv/www'; // Or a more configurable path, ensure it's absolute.

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
  if (!absolutePath.startsWith(BASE_DIR)) {
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

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found.', details: `Path: ${filePath}` }, { status: 404 });
    }
    if (fs.statSync(filePath).isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory, not a file.', details: `Path: ${filePath}` }, { status: 400 });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error: any) {
    console.error('[API /panel-daemon/file] Error reading file:', error);
     if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.message.startsWith('File path is required')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to read file.', details: error.message }, { status: 500 });
  }
}
