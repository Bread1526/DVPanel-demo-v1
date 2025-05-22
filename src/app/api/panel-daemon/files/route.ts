
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/'; 

console.log(`[API /panel-daemon/files] Using BASE_DIR: ${BASE_DIR}`);

function modeToRwxString(mode: number, isDirectory: boolean): string {
    let str = isDirectory ? 'd' : '-';
    str += (mode & fs.constants.S_IRUSR) ? 'r' : '-';
    str += (mode & fs.constants.S_IWUSR) ? 'w' : '-';
    str += (mode & fs.constants.S_IXUSR) ? 'x' : '-';
    str += (mode & fs.constants.S_IRGRP) ? 'r' : '-';
    str += (mode & fs.constants.S_IWGRP) ? 'w' : '-';
    str += (mode & fs.constants.S_IXGRP) ? 'x' : '-';
    str += (mode & fs.constants.S_IROTH) ? 'r' : '-';
    str += (mode & fs.constants.S_IWOTH) ? 'w' : '-';
    str += (mode & fs.constants.S_IXOTH) ? 'x' : '-';
    return str;
}

function modeToOctalString(mode: number): string {
  // Extract only the permission bits (last 3 octal digits)
  // and combine with SUID, SGID, Sticky bits (first digit of 4-digit octal)
  return (mode & 0o7777).toString(8).padStart(4, '0');
}


function resolveSafePath(relativePath: string): string {
  let normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  
  // If BASE_DIR is '/', an absolute userPath is allowed as is (after normalization)
  // If userPath is relative, it will be joined with BASE_DIR.
  let absolutePath: string;

  if (BASE_DIR === '/') {
    if (path.isAbsolute(normalizedUserPath)) {
      absolutePath = normalizedUserPath;
    } else {
      // Handle cases like "foo" becoming "/foo" if BASE_DIR is "/"
      absolutePath = path.join(BASE_DIR, normalizedUserPath);
    }
  } else {
    // If BASE_DIR is not '/', userPath must be treated as relative to BASE_DIR
    // To prevent userPath like "/etc/passwd" from resolving to system root when joined
    // with a BASE_DIR like "/srv/myfiles", we ensure userPath doesn't escape.
    // The replace call above helps, and the startsWith check below is crucial.
    if (path.isAbsolute(normalizedUserPath)) {
      // This case is tricky. If user sends "/foo" and BASE_DIR is "/srv",
      // path.join might result in "/srv/foo" or just "/foo" depending on `path.join` behavior.
      // We want to ensure it's treated as relative to BASE_DIR contextually.
      // A simple approach is to remove leading slash from userPath if BASE_DIR is not root.
      normalizedUserPath = normalizedUserPath.startsWith(path.sep) ? normalizedUserPath.substring(1) : normalizedUserPath;
    }
    absolutePath = path.join(BASE_DIR, normalizedUserPath);
  }
  
  absolutePath = path.normalize(absolutePath);

  // Final security check
  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
        console.error(
            `[API Security /files - resolveSafePath] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
        );
        throw new Error('Access denied: Invalid path resolution.');
    }
    // No startsWith check needed if BASE_DIR is root, any absolute path is "within"
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(
      `[API Security /files - resolveSafePath] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  console.log(`[API /panel-daemon/files - resolveSafePath] Resolved: '${absolutePath}' from relative: '${relativePath}' (normalizedUserPath: '${normalizedUserPath}')`);
  return absolutePath;
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path') || '/'; 
  let dirPath = '';

  try {
    dirPath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/files GET] Attempting to list directory: ${dirPath} (requested relative: ${requestedPath})`);

    if (!fs.existsSync(dirPath)) {
      console.warn(`[API /panel-daemon/files GET] Path not found: ${dirPath}`);
      return NextResponse.json({ error: 'Path not found.', details: `Server path: ${dirPath}` }, { status: 404 });
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      console.warn(`[API /panel-daemon/files GET] Path is not a directory: ${dirPath}`);
      return NextResponse.json({ error: 'Path is not a directory.', details: `Server path: ${dirPath}` }, { status: 400 });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(entry => {
      const entryPath = path.join(dirPath, entry.name);
      let stats;
      try {
        stats = fs.lstatSync(entryPath); // Use lstat to handle symlinks correctly
      } catch (e: any) {
        console.warn(`[API /panel-daemon/files GET] Failed to stat ${entryPath}: ${e.message}`);
        const typeFromDirent = entry.isDirectory() ? 'folder' : (entry.isFile() ? 'file' : (entry.isSymbolicLink() ? 'link' : 'unknown'));
        return {
          name: entry.name,
          type: typeFromDirent,
          size: null,
          modified: null,
          permissions: '---------',
          octalPermissions: "0000",
        };
      }

      return {
        name: entry.name,
        type: stats.isDirectory() ? 'folder' : (stats.isFile() ? 'file' : (stats.isSymbolicLink() ? 'link' : 'unknown')),
        size: stats.isFile() ? stats.size : null, // Only show size for files
        modified: stats.mtime.toISOString(),
        permissions: modeToRwxString(stats.mode, stats.isDirectory()),
        octalPermissions: modeToOctalString(stats.mode),
      };
    });

    // Construct the client-facing path to return, ensuring it starts with '/' and has no trailing slash unless it's root
    let clientPath = path.normalize(requestedPath).replace(/\\/g, '/');
    if (!clientPath.startsWith('/')) clientPath = '/' + clientPath;
    if (clientPath !== '/' && clientPath.endsWith('/')) clientPath = clientPath.slice(0, -1);
    
    console.log(`[API /panel-daemon/files GET] Successfully listed ${result.length} entries for clientPath: ${clientPath} (server path: ${dirPath})`);
    return NextResponse.json({ path: clientPath, files: result });

  } catch (error: any) {
    const errorMessage = error.message || "An unknown error occurred server-side.";
    console.error(`[API /panel-daemon/files GET] Error listing files for requested path "${requestedPath}" (resolved to "${dirPath}"):`, errorMessage, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Requested path: ${requestedPath}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list files.', details: `Path: ${dirPath || requestedPath}. Server Error: ${errorMessage}` }, { status: 500 });
  }
}
