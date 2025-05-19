
// src/app/api/panel-daemon/file/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Stream } from 'stream';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';

console.log(`[API /panel-daemon/file] Using BASE_DIR: ${BASE_DIR}`);

function resolveSafePath(relativePath: string): string {
  // Normalize the user-provided path to prevent directory traversal
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (BASE_DIR === '/') {
    // If BASE_DIR is root, resolve relativePath directly from root
    // but ensure it's treated as an absolute path for security checks later
    // path.join will handle making it absolute if it starts with /
    // or relative to cwd if it doesn't, which is not what we want if relativePath is like "etc/passwd"
    // So, we ensure normalizedUserPath starts with / if it's meant to be from the fs root.
    // However, userPath is usually relative TO BASE_DIR.
    // The critical part is that the FINAL absolutePath must be checked.

    // Safest way: join then normalize. path.join will correctly handle if normalizedUserPath starts with /
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));

    // Additional check if BASE_DIR is '/'
    // If normalizedUserPath was absolute (e.g. "/etc/passwd"), path.join("/", "/etc/passwd") is "/etc/passwd"
    // We need to ensure that even if BASE_DIR is '/', we are not inadvertently creating a path outside
    // what might be an intended chroot or sandboxed environment if that were in place.
    // For now, this check is minimal, relying on the startsWith check below.
  } else {
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));
  }

  // Security Check: Ensure the resolved absolute path is still within the BASE_DIR
  // This handles cases like `/` for relativePath when BASE_DIR is not `/`
  // or if normalizedUserPath tries `../../` extensively.
  if (BASE_DIR === '/') {
    // If BASE_DIR is '/', any absolute path is "within" it.
    // The main concern is not exposing sensitive system files.
    // This requires careful server permissions.
    // We check if it's an absolute path, which it should be by now.
    if (!path.isAbsolute(absolutePath)) {
        console.error(
            `[API Security] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
        );
        throw new Error('Access denied: Invalid path resolution.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(
      `[API Security] Access Denied (Outside Base Directory - File): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
    );
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  console.log(`[API /panel-daemon/file - resolveSafePath] Resolved: '${absolutePath}' from relative: '${relativePath}'`);
  return absolutePath;
}

// Basic MIME type lookup
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
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream'; 
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestedPath = searchParams.get('path');

  if (!requestedPath) {
    return NextResponse.json({ error: 'File path query parameter is required.' }, { status: 400 });
  }

  try {
    const filePath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/file GET] Attempting to read file: ${filePath} (requested relative: ${requestedPath})`);

    if (!fs.existsSync(filePath)) {
      console.warn(`[API /panel-daemon/file GET] File not found: ${filePath}`);
      return NextResponse.json({ error: 'File not found.', details: `Path: ${filePath}` }, { status: 404 });
    }
    if (fs.statSync(filePath).isDirectory()) {
      console.warn(`[API /panel-daemon/file GET] Path is a directory, not a file: ${filePath}`);
      return NextResponse.json({ error: 'Path is a directory, not a file.', details: `Path: ${filePath}` }, { status: 400 });
    }

    const forViewing = searchParams.get('view') === 'true';
    const mimeType = getMimeType(filePath);
    
    let isWritable = false;
    try {
      fs.accessSync(filePath, fs.constants.W_OK);
      isWritable = true;
    } catch (e) {
      isWritable = false;
      console.warn(`[API /panel-daemon/file GET] File not writable: ${filePath}`);
    }
    
    const viewableTextMimeTypes = ['text/', 'application/javascript', 'application/json', 'application/x-yaml', 'application/xml', 'application/typescript'];
    const isViewableTextFile = viewableTextMimeTypes.some(prefix => mimeType.startsWith(prefix));


    if (!forViewing || !isViewableTextFile) {
      const stats = fs.statSync(filePath);
      const data: ReadableStream<Uint8Array> = Stream.Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
      const filename = path.basename(filePath);
      
      console.log(`[API /panel-daemon/file GET] Successfully preparing file for download: ${filePath}`);
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': mimeType,
          'Content-Length': stats.size.toString(),
        },
      });
    } else {
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`[API /panel-daemon/file GET] Successfully read file for viewing: ${filePath}, Writable: ${isWritable}`);
      return NextResponse.json({ content, writable: isWritable, path: requestedPath });
    }

  } catch (error: any) {
    console.error('[API /panel-daemon/file GET] Error reading file:', error);
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
      fs.accessSync(filePath, fs.constants.W_OK);
    } catch (e) {
      // If the file doesn't exist, accessSync will throw ENOENT. 
      // We should still allow writing (creating) the file if the directory is writable.
      // For now, let's assume if accessSync fails (not W_OK or ENOENT), it's a permission issue on existing file or dir.
      // A more robust check would verify directory writability if file doesn't exist.
      const fileExists = fs.existsSync(filePath);
      if (fileExists) { // If file exists but not writable
        console.warn(`[API /panel-daemon/file POST] File not writable: ${filePath}`);
        return NextResponse.json({ error: 'File is not writable.', details: `Path: ${filePath}` }, { status: 403 });
      }
      // If file doesn't exist, we'll let writeFileSync attempt to create it.
      // It will fail if directory permissions are insufficient.
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');

    console.log(`[API /panel-daemon/file POST] Successfully wrote content to ${filePath}.`);
    return NextResponse.json({ success: true, message: `File ${path.basename(filePath)} saved successfully.` });

  } catch (error: any) {
    console.error('[API /panel-daemon/file POST] Error writing file:', error);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Attempted path: ${request.nextUrl.searchParams.get('path')}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to save file.', details: error.message }, { status: 500 });
  }
}
