
// src/app/api/panel-daemon/permissions/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/'; 

function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.join(BASE_DIR, normalizedUserPath);

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(`[API Security] Access Denied (Path not absolute - Permissions): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
      throw new Error('Access denied: Resolved path is not absolute.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(`[API Security] Access Denied (Outside Base Directory - Permissions): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  console.log(`[API /panel-daemon/permissions - resolveSafePath] Resolved: '${absolutePath}' from relative: '${relativePath}'`);
  return absolutePath;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: requestedPath, mode: octalMode } = body;

    if (!requestedPath || typeof requestedPath !== 'string') {
      return NextResponse.json({ error: 'File path is required and must be a string.' }, { status: 400 });
    }
    if (!octalMode || typeof octalMode !== 'string' || !/^[0-7]{3,4}$/.test(octalMode)) {
        return NextResponse.json({ error: 'Permissions mode is required and must be a 3 or 4 digit octal string (e.g., "755" or "0755").' }, { status: 400 });
    }

    const filePath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/permissions] Attempting to chmod file: ${filePath} to mode: ${octalMode}`);

    if (!fs.existsSync(filePath)) {
      console.warn(`[API /panel-daemon/permissions] File not found for chmod: ${filePath}`);
      return NextResponse.json({ error: 'File or directory not found.', details: `Path: ${filePath}` }, { status: 404 });
    }
    
    fs.chmodSync(filePath, parseInt(octalMode, 8)); // parseInt with radix 8 for octal

    console.log(`[API /panel-daemon/permissions] Successfully changed permissions for ${filePath} to ${octalMode}.`);
    return NextResponse.json({ success: true, message: `Permissions for ${path.basename(filePath)} updated to ${octalMode}.` });

  } catch (error: any) {
    console.error('[API /panel-daemon/permissions] Error changing permissions:', error);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to change permissions.', details: error.message }, { status: 500 });
  }
}
