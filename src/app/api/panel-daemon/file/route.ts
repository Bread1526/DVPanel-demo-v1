
// src/app/api/panel-daemon/file/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/srv/www'; // Or a more configurable path

function resolveSafePath(userPath: string | undefined | null): string {
  if (!userPath) {
    throw new Error('File path is required.');
  }
  const resolvedPath = path.resolve(BASE_DIR, userPath);
  if (!resolvedPath.startsWith(path.resolve(BASE_DIR))) {
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  return resolvedPath;
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
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
    if (fs.statSync(filePath).isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory, not a file.' }, { status: 400 });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    // For file content, it's often better to send as plain text
    // but Next.js API routes typically wrap in NextResponse.json or similar.
    // Sending as text/plain:
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
