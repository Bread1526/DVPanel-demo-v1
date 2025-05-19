
// src/app/api/panel-daemon/create/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';

function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (path.isAbsolute(normalizedUserPath) && BASE_DIR === '/') {
    absolutePath = normalizedUserPath;
  } else if (path.isAbsolute(normalizedUserPath) && BASE_DIR !== '/') {
    console.warn(`[API Security /create] Attempt to use absolute path '${normalizedUserPath}' when BASE_DIR is '${BASE_DIR}'. Treating as relative to BASE_DIR's root.`);
    absolutePath = path.normalize(path.join(BASE_DIR, path.basename(normalizedUserPath)));
  } else {
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));
  }

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(`[API Security /create] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
      throw new Error('Access denied: Invalid path resolution.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(`[API Security /create] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  console.log(`[API /panel-daemon/create - resolveSafePath] Resolved directory path: '${absolutePath}' from relative: '${relativePath}'`);
  return absolutePath;
}

// Basic validation for file/folder names
function isValidName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name.includes('/') || name.includes('\\')) return false; // No path traversal
  if (name === '.' || name === '..') return false;
  // Add other invalid characters or patterns if needed
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: requestedDirPath, name: newItemName, type: itemType } = body;

    if (typeof requestedDirPath !== 'string') {
      return NextResponse.json({ error: 'Directory path is required and must be a string.' }, { status: 400 });
    }
    if (!isValidName(newItemName)) {
      return NextResponse.json({ error: 'Invalid name for file or folder. Names cannot be empty or contain slashes.' }, { status: 400 });
    }
    if (itemType !== 'file' && itemType !== 'folder') {
      return NextResponse.json({ error: 'Invalid item type. Must be "file" or "folder".' }, { status: 400 });
    }

    const directoryPath = resolveSafePath(requestedDirPath);
    const newItemPath = path.join(directoryPath, newItemName);

    console.log(`[API /panel-daemon/create POST] Attempting to create ${itemType}: ${newItemPath}`);

    // Check if directoryPath exists and is a directory
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
      console.warn(`[API /panel-daemon/create POST] Parent directory does not exist or is not a directory: ${directoryPath}`);
      return NextResponse.json({ error: 'Parent directory not found.', details: `Path: ${requestedDirPath}` }, { status: 404 });
    }
    
    // Check permissions for parent directory
     try {
        fs.accessSync(directoryPath, fs.constants.W_OK);
    } catch (e) {
        console.warn(`[API /panel-daemon/create POST] Permission denied for writing to parent directory ${directoryPath}:`, (e as Error).message);
        return NextResponse.json({ error: 'Permission denied. Cannot create item in this directory.', details: `Path: ${requestedDirPath}` }, { status: 403 });
    }


    if (fs.existsSync(newItemPath)) {
      console.warn(`[API /panel-daemon/create POST] Item already exists: ${newItemPath}`);
      return NextResponse.json({ error: `${itemType === 'file' ? 'File' : 'Folder'} "${newItemName}" already exists.` }, { status: 409 }); // 409 Conflict
    }

    if (itemType === 'file') {
      fs.writeFileSync(newItemPath, '', 'utf-8'); // Create an empty file
    } else { // itemType === 'folder'
      fs.mkdirSync(newItemPath);
    }

    console.log(`[API /panel-daemon/create POST] Successfully created ${itemType}: ${newItemPath}.`);
    return NextResponse.json({ success: true, message: `${itemType === 'file' ? 'File' : 'Folder'} "${newItemName}" created successfully.` });

  } catch (error: any) {
    console.error('[API /panel-daemon/create POST] Error creating item:', error.message, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Requested path might be invalid.` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to create item.', details: error.message }, { status: 500 });
  }
}
