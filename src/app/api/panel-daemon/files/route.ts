
// src/app/api/panel-daemon/files/route.ts
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
  return (mode & 0o777).toString(8).padStart(3, '0');
}


function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(
        `[API Security] Access Denied (Path not absolute - Files): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
      );
      throw new Error('Access denied: Resolved path is not absolute.');
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
    const result = entries.map(entry => {
      const entryPath = path.join(dirPath, entry.name);
      let stats;
      try {
        stats = fs.statSync(entryPath);
      } catch (e: any) {
        console.warn(`[API /panel-daemon/files] Failed to stat ${entryPath}: ${e.message}`);
        const typeFromDirent = entry.isDirectory() ? 'folder' : (entry.isFile() ? 'file' : 'unknown');
        return {
          name: entry.name,
          type: typeFromDirent,
          size: null,
          modified: null,
          permissions: '---------',
          octalPermissions: '000',
        };
      }

      return {
        name: entry.name,
        type: stats.isDirectory() ? 'folder' : (stats.isFile() ? 'file' : 'unknown'),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        permissions: modeToRwxString(stats.mode, stats.isDirectory()),
        octalPermissions: modeToOctalString(stats.mode),
      };
    });

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
