
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
  // Ensure it represents file/dir type correctly + permissions
  const type = fs.lstatSync(path.resolve(BASE_DIR)).mode & fs.constants.S_IFMT; // Get file type bits
  return ((type | (mode & 0o7777))).toString(8).padStart(4, '0'); // SUID,SGID,Sticky + rwx
}


function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (path.isAbsolute(normalizedUserPath) && BASE_DIR === '/') {
    absolutePath = normalizedUserPath;
  } else if (path.isAbsolute(normalizedUserPath) && BASE_DIR !== '/') {
     console.warn(`[API Security] Attempt to use absolute path '${normalizedUserPath}' when BASE_DIR is '${BASE_DIR}'.`);
     absolutePath = path.normalize(path.join(BASE_DIR, path.basename(normalizedUserPath)));
  }
  else {
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));
  }

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(
        `[API Security] Path construction error (Not Absolute - Files): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
      );
      throw new Error('Access denied: Invalid path resolution.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(
      `[API Security] Access Denied (Outside Base Directory - Files): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  console.log(`[API /panel-daemon/files - resolveSafePath] Resolved: '${absolutePath}' from relative: '${relativePath}' (normalizedUserPath: '${normalizedUserPath}')`);
  return absolutePath;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path') || '/'; 

  try {
    const dirPath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/files GET] Attempting to list directory: ${dirPath} (requested relative: ${requestedPath})`);

    if (!fs.existsSync(dirPath)) {
      console.warn(`[API /panel-daemon/files GET] Path not found: ${dirPath}`);
      return NextResponse.json({ error: 'Path not found.', details: `Path: ${dirPath}` }, { status: 404 });
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      console.warn(`[API /panel-daemon/files GET] Path is not a directory: ${dirPath}`);
      return NextResponse.json({ error: 'Path is not a directory.', details: `Path: ${dirPath}` }, { status: 400 });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(entry => {
      const entryPath = path.join(dirPath, entry.name);
      let stats;
      try {
        stats = fs.lstatSync(entryPath); // Use lstat to handle symlinks correctly
      } catch (e: any) {
        console.warn(`[API /panel-daemon/files GET] Failed to stat ${entryPath}: ${e.message}`);
        const typeFromDirent = entry.isDirectory() ? 'folder' : (entry.isFile() ? 'file' : 'unknown');
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
        size: stats.size,
        modified: stats.mtime.toISOString(),
        permissions: modeToRwxString(stats.mode, stats.isDirectory()),
        octalPermissions: modeToOctalString(stats.mode),
      };
    });

    // Construct the client-facing path to return, ensuring it starts with '/'
    const clientPath = ('/' + path.normalize(requestedPath).replace(/\\/g, '/')).replace(/\/+/g, '/');
    
    console.log(`[API /panel-daemon/files GET] Successfully listed ${result.length} entries for clientPath: ${clientPath}`);
    return NextResponse.json({ path: clientPath, files: result });

  } catch (error: any) {
    console.error('[API /panel-daemon/files GET] Error listing files:', error.message, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Requested path: ${requestedPath}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list files.', details: error.message }, { status: 500 });
  }
}
