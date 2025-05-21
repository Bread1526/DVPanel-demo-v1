
// src/app/api/panel-daemon/snapshots/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { v4 as uuidv4 } from 'uuid';
import type { Snapshot } from '@/app/(app)/files/editor/[...filePath]/page';
import { loadPanelSettings } from '@/app/(app)/settings/actions';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';
const MAX_SERVER_SNAPSHOTS = 10;

interface SnapshotFile {
  snapshots: Snapshot[];
}

// Helper function to resolve safe paths for the *original file*
function resolveSafeOriginalFilePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (path.isAbsolute(normalizedUserPath) && BASE_DIR === '/') {
    absolutePath = normalizedUserPath;
  } else if (path.isAbsolute(normalizedUserPath) && BASE_DIR !== '/') {
    console.warn(`[API Security /snapshots - resolveSafeOriginalFilePath] Attempt to use absolute path '${normalizedUserPath}' when BASE_DIR is '${BASE_DIR}'. Treating as relative to BASE_DIR's root.`);
    absolutePath = path.normalize(path.join(BASE_DIR, path.basename(normalizedUserPath)));
  } else {
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));
  }

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(`[API Security /snapshots - resolveSafeOriginalFilePath] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
      throw new Error('Access denied: Invalid path resolution for original file.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(`[API Security /snapshots - resolveSafeOriginalFilePath] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
    throw new Error('Access denied: Original file path is outside the allowed directory.');
  }
  return absolutePath;
}

// Helper to get paths for the snapshot file itself
function getSnapshotStorageInfo(originalFilePathRelativeFromBase: string): { snapshotDir: string, snapshotFilename: string, fullSnapshotPathForFs: string, relativeSnapshotPathForStorage: string } {
  // Ensure originalFilePathRelativeFromBase is treated as relative to BASE_DIR
  const baseDirNormalized = path.normalize(BASE_DIR);
  let absoluteOriginalPath;

  // If originalFilePathRelativeFromBase starts with BASE_DIR, remove it to make it truly relative
  const normalizedRelativePath = path.normalize(originalFilePathRelativeFromBase);
  if (normalizedRelativePath.startsWith(baseDirNormalized)) {
    absoluteOriginalPath = normalizedRelativePath; // It's already absolute or effectively so
  } else {
     absoluteOriginalPath = path.join(baseDirNormalized, normalizedRelativePath);
  }


  const originalDir = path.dirname(absoluteOriginalPath);
  const originalFilename = path.basename(absoluteOriginalPath);
  
  const sanitizedOriginalFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotFilename = `${sanitizedOriginalFilename}-snapshots.json`;
  const fullSnapshotPathForFs = path.join(originalDir, snapshotFilename);

  // For storageService, we need a path relative to where it stores files.
  // Assuming storageService is configured to store files within a data directory,
  // and we want snapshots to be co-located with the original file's *relative path structure*
  // within that data store.
  // Example: if original file is /srv/www/my/project/file.txt (and BASE_DIR=/srv/www)
  // originalFilePathRelativeFromBase would be my/project/file.txt
  // relativeSnapshotPathForStorage would be my/project/file.txt-snapshots.json
  const dirOfRelativeOriginal = path.dirname(originalFilePathRelativeFromBase);
  const relativeSnapshotPathForStorage = path.join(dirOfRelativeOriginal === '.' ? '' : dirOfRelativeOriginal, snapshotFilename).replace(/\\/g, '/');
  
  return { snapshotDir: originalDir, snapshotFilename, fullSnapshotPathForFs, relativeSnapshotPathForStorage };
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const originalFilePathRelative = searchParams.get('filePath'); // Path relative to BASE_DIR
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (!originalFilePathRelative) {
    if (debugMode) console.warn("[API /snapshots GET] 'filePath' query parameter is required.");
    return NextResponse.json({ error: 'filePath query parameter is required.' }, { status: 400 });
  }

  try {
    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative); 
    if (!fs.existsSync(safeOriginalFilePath) || fs.statSync(safeOriginalFilePath).isDirectory()) {
        if (debugMode) console.warn(`[API /snapshots GET] Original file not found or is a directory: ${safeOriginalFilePath}`);
        return NextResponse.json({ snapshots: [] }); 
    }

    const { relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);
    if (debugMode) console.log(`[API /snapshots GET] Attempting to load snapshots using storage key: ${relativeSnapshotPathForStorage} for original file: ${originalFilePathRelative}`);

    const data = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;

    if (data && Array.isArray(data.snapshots)) {
      if (debugMode) console.log(`[API /snapshots GET] Successfully loaded ${data.snapshots.length} snapshots for ${originalFilePathRelative}`);
      return NextResponse.json({ snapshots: data.snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
    } else {
      if (debugMode) console.log(`[API /snapshots GET] No snapshots found or invalid format for ${originalFilePathRelative} (key: ${relativeSnapshotPathForStorage}), returning empty array.`);
      return NextResponse.json({ snapshots: [] });
    }
  } catch (error: any) {
    console.error(`[API /snapshots GET] Error listing snapshots for ${originalFilePathRelative}:`, error.message, error.stack);
    if (error.message?.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list snapshots.', details: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;
  let body;

  try {
    body = await request.json();
  } catch (e: any) {
    if (debugMode) console.warn("[API /snapshots POST] Invalid JSON in request body:", e.message);
    return NextResponse.json({ error: "Invalid JSON in request body.", details: e.message }, { status: 400 });
  }

  const { filePath: originalFilePathRelative, content, language } = body;

  if (!originalFilePathRelative || typeof originalFilePathRelative !== 'string') {
    if (debugMode) console.warn("[API /snapshots POST] 'filePath' (original file path) is required in body.");
    return NextResponse.json({ error: 'Original file path (filePath) is required.' }, { status: 400 });
  }
  if (typeof content !== 'string') {
    if (debugMode) console.warn("[API /snapshots POST] 'content' is required in body.");
    return NextResponse.json({ error: 'Snapshot content is required.' }, { status: 400 });
  }
  if (typeof language !== 'string') {
     if (debugMode) console.warn("[API /snapshots POST] 'language' is required in body.");
    return NextResponse.json({ error: 'Snapshot language is required.' }, { status: 400 });
  }

  try {
    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative);
    if (!fs.existsSync(safeOriginalFilePath) || fs.statSync(safeOriginalFilePath).isDirectory()) {
        if (debugMode) console.warn(`[API /snapshots POST] Original file for snapshot not found or is a directory: ${safeOriginalFilePath}`);
        return NextResponse.json({ error: 'Original file not found or is a directory, cannot create snapshot.' }, { status: 404 });
    }

    const { relativeSnapshotPathForStorage, snapshotDir } = getSnapshotStorageInfo(originalFilePathRelative);

    if (debugMode) console.log(`[API /snapshots POST] Creating snapshot for: ${originalFilePathRelative}. Storing with key: ${relativeSnapshotPathForStorage}`);
    
    // Check writability of the directory where the snapshot file will be stored by storageService
    // storageService itself will try to create its base data directory if not present.
    // This check is more about if snapshotDir itself is writable, though saveEncryptedData will create its own path.
    try {
        const dataDir = path.dirname(path.join(snapshotDir, relativeSnapshotPathForStorage)); // Get the dir where the snapshot JSON will live
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            if (debugMode) console.log(`[API /snapshots POST] Created snapshot directory: ${dataDir}`);
        }
        fs.accessSync(dataDir, fs.constants.W_OK);
    } catch(e: any) {
        console.error(`[API /snapshots POST] Permission issue or error creating snapshot directory for ${relativeSnapshotPathForStorage}. Error: ${e.message}`);
        // This might be an overly aggressive check if saveEncryptedData can handle paths deeply.
    }


    let existingSnapshots: Snapshot[] = [];
    try {
      const currentSnapshotData = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;
      if (currentSnapshotData && Array.isArray(currentSnapshotData.snapshots)) {
        existingSnapshots = currentSnapshotData.snapshots;
      }
    } catch (loadError: any) {
      if (debugMode) console.warn(`[API /snapshots POST] Error loading existing snapshots for ${relativeSnapshotPathForStorage}, starting fresh. Error: ${loadError.message}`);
    }

    const newSnapshot: Snapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      content,
      language,
      isLocked: false,
    };

    existingSnapshots.unshift(newSnapshot); 

    const lockedSnapshots = existingSnapshots.filter(s => s.isLocked);
    let unlockedSnapshots = existingSnapshots.filter(s => !s.isLocked);
    
    unlockedSnapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const totalAllowedSnapshots = MAX_SERVER_SNAPSHOTS;
    const numUnlockedToKeep = Math.max(0, totalAllowedSnapshots - lockedSnapshots.length);

    if (unlockedSnapshots.length > numUnlockedToKeep) {
        const numToPrune = unlockedSnapshots.length - numUnlockedToKeep;
        if (debugMode) console.log(`[API /snapshots POST] Pruning ${numToPrune} oldest unlocked snapshot(s) for ${originalFilePathRelative}. Keeping ${numUnlockedToKeep} unlocked.`);
        unlockedSnapshots = unlockedSnapshots.slice(numToPrune);
    }
    
    const finalSnapshots = [...lockedSnapshots, ...unlockedSnapshots];
    finalSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (lockedSnapshots.length >= totalAllowedSnapshots && !finalSnapshots.find(s => s.id === newSnapshot.id)) {
        if (debugMode) console.warn(`[API /snapshots POST] Cannot create snapshot for ${originalFilePathRelative}. All ${totalAllowedSnapshots} snapshot slots are effectively filled by locked snapshots.`);
        return NextResponse.json({ 
            error: `Cannot create new snapshot. All ${totalAllowedSnapshots} snapshot slots are filled by locked snapshots. Unlock some or delete manually.`,
            snapshots: existingSnapshots.filter(s => s.id !== newSnapshot.id) 
        }, { status: 400 });
    }
    
    const dataToSave: SnapshotFile = { snapshots: finalSnapshots };
    await saveEncryptedData(relativeSnapshotPathForStorage, dataToSave);

    if (debugMode) console.log(`[API /snapshots POST] Snapshot created and saved for ${originalFilePathRelative}. Total snapshots: ${finalSnapshots.length}`);
    return NextResponse.json({ success: true, message: 'Snapshot created successfully.', snapshots: finalSnapshots });

  } catch (error: any) {
    console.error(`[API /snapshots POST] Error creating snapshot for path ${originalFilePathRelative || 'unknown'}:`, error.message, error.stack);
    if (error.message?.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to create snapshot on server.', details: error.message, stack: debugMode ? error.stack : undefined }, { status: 500 });
  }
}
