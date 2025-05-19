
// src/app/api/panel-daemon/file/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Stream } from 'stream';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';

console.log(`[API /panel-daemon/file] Using BASE_DIR: ${BASE_DIR}`);

function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(
        `[API Security] Access Denied (Path not absolute - File): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`
      );
      throw new Error('Access denied: Resolved path is not absolute.');
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
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
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
    
    // For text-based files to be viewed in editor or certain known types
    const viewableTextMimeTypes = ['text/', 'application/javascript', 'application/json', 'application/x-yaml', 'application/xml'];
    const isViewableTextFile = viewableTextMimeTypes.some(prefix => mimeType.startsWith(prefix));


    if (!forViewing || !isViewableTextFile) {
      // For download or non-text files
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
      // For viewing text-based files in the editor
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`[API /panel-daemon/file GET] Successfully read file for viewing: ${filePath}`);
      return new NextResponse(content, {
        status: 200,
        headers: { 'Content-Type': `${mimeType}; charset=utf-8` },
      });
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
    if (typeof content !== 'string') { // Content can be an empty string
      return NextResponse.json({ error: 'File content is required and must be a string.' }, { status: 400 });
    }

    const filePath = resolveSafePath(requestedPath);
    console.log(`[API /panel-daemon/file POST] Attempting to write file: ${filePath}`);

    // Optionally, check if it's a directory before writing (fs.statSync(filePath).isDirectory())
    // Though writeFileSync would typically fail or overwrite depending on OS if it's a directory.

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
