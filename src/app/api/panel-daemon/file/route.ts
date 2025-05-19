
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Stream } from 'stream';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/'; 

console.log(`[API /panel-daemon/file] Using BASE_DIR: ${BASE_DIR}`);

function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (path.isAbsolute(normalizedUserPath) && BASE_DIR === '/') {
    absolutePath = normalizedUserPath;
  } else if (path.isAbsolute(normalizedUserPath) && BASE_DIR !== '/') {
     // If userPath is absolute but BASE_DIR is not root, this is suspicious.
     // For safety, disallow or treat as relative to BASE_DIR.
     // Here, we'll strictly disallow if it doesn't fall within BASE_DIR after resolving.
     // This case typically shouldn't happen if client sends relative paths.
     console.warn(`[API Security] Attempt to use absolute path '${normalizedUserPath}' when BASE_DIR is '${BASE_DIR}'.`);
     absolutePath = path.normalize(path.join(BASE_DIR, path.basename(normalizedUserPath))); // Fallback to just basename in base_dir
  }
  else {
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));
  }
  
  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
        console.error(
            `[API Security] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
        );
        throw new Error('Access denied: Invalid path resolution.');
    }
    // No startsWith check needed if BASE_DIR is root, any absolute path is "within"
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(
      `[API Security] Access Denied (Outside Base Directory - File): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  console.log(`[API /panel-daemon/file - resolveSafePath] Resolved: '${absolutePath}' from relative: '${relativePath}'`);
  return absolutePath;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.txt': return 'text/plain';
    case '.html': case '.htm': return 'text/html';
    case '.css': return 'text/css';
    case '.js': case '.jsx': return 'application/javascript';
    case '.ts': case '.tsx': return 'application/typescript';
    case '.json': return 'application/json';
    case '.yaml': case '.yml': return 'application/x-yaml';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream'; 
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path');
  const forViewing = searchParams.get('view') === 'true';

  if (!requestedPath) {
    return NextResponse.json({ error: 'File path query parameter is required.' }, { status: 400 });
  }

  try {
    const filePath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/file GET] Attempting to access file: ${filePath} (requested relative: ${requestedPath}), For viewing: ${forViewing}`);

    if (!fs.existsSync(filePath)) {
      console.warn(`[API /panel-daemon/file GET] File not found: ${filePath}`);
      return NextResponse.json({ error: 'File not found.', details: `Path: ${filePath}` }, { status: 404 });
    }
    if (fs.statSync(filePath).isDirectory()) {
      console.warn(`[API /panel-daemon/file GET] Path is a directory, not a file: ${filePath}`);
      return NextResponse.json({ error: 'Path is a directory, not a file.', details: `Path: ${filePath}` }, { status: 400 });
    }

    let isWritable = false;
    try {
      fs.accessSync(filePath, fs.constants.W_OK);
      isWritable = true;
    } catch (e) {
      // Only log if it's not an existence error, which is already handled.
      // This catch is specifically for permission issues on an existing file.
      if (fs.existsSync(filePath)) {
        console.warn(`[API /panel-daemon/file GET] File not writable: ${filePath}`);
      }
      isWritable = false;
    }
    
    if (forViewing) {
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`[API /panel-daemon/file GET] Successfully read file for viewing: ${filePath}, Writable: ${isWritable}`);
      return NextResponse.json({ content, writable: isWritable, path: requestedPath });
    } else {
      // For download
      const stats = fs.statSync(filePath);
      const data: ReadableStream<Uint8Array> = Stream.Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
      const filename = path.basename(filePath);
      const mimeType = getMimeType(filePath);
      
      console.log(`[API /panel-daemon/file GET] Successfully preparing file for download: ${filePath}`);
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': mimeType,
          'Content-Length': stats.size.toString(),
        },
      });
    }

  } catch (error: any) {
    console.error('[API /panel-daemon/file GET] Error reading file:', error.message, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Requested path: ${requestedPath}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to read file.', details: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: requestedPath, content } = body;

    if (!requestedPath || typeof requestedPath !== 'string') {
      return NextResponse.json({ error: 'File path is required and must be a string.' }, { status: 400 });
    }
    if (typeof content !== 'string') { 
      return NextResponse.json({ error: 'File content is required and must be a string.' }, { status: 400 });
    }

    const filePath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/file POST] Attempting to write file: ${filePath}`);

    try {
      // Check if directory exists and is writable, or if file exists and is writable
      const dirOfFile = path.dirname(filePath);
      if (!fs.existsSync(dirOfFile)) {
        console.warn(`[API /panel-daemon/file POST] Directory does not exist: ${dirOfFile}`);
        return NextResponse.json({ error: 'Directory does not exist, cannot save file.', details: `Path: ${filePath}` }, { status: 400 });
      }
      // Check write access to directory if file doesn't exist, or to file if it exists
      const targetPathForAccessCheck = fs.existsSync(filePath) ? filePath : dirOfFile;
      fs.accessSync(targetPathForAccessCheck, fs.constants.W_OK);
    } catch (e: any) {
      console.warn(`[API /panel-daemon/file POST] Permission denied for writing to ${filePath} or its directory:`, e.message);
      return NextResponse.json({ error: 'Permission denied. Cannot save file.', details: `Path: ${filePath}` }, { status: 403 });
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`[API /panel-daemon/file POST] Successfully wrote content to ${filePath}.`);
    return NextResponse.json({ success: true, message: `File ${path.basename(filePath)} saved successfully.` });

  } catch (error: any) {
    console.error('[API /panel-daemon/file POST] Error writing file:', error.message, error.stack);
    if (error.message.startsWith('Access denied')) { // From resolveSafePath
      return NextResponse.json({ error: error.message, details: `Attempted path might be invalid.` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to save file.', details: error.message }, { status: 500 });
  }
}
