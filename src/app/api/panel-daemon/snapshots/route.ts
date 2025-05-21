
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
      const constructionErrorMsg = `[API Security /snapshots - resolveSafeOriginalFilePath] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`;
      console.error(constructionErrorMsg);
      throw new Error('Access denied: Invalid path resolution for original file.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    const accessDeniedMsg = `[API Security /snapshots - resolveSafeOriginalFilePath] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`;
    console.error(accessDeniedMsg);
    throw new Error('Access denied: Original file path is outside the allowed directory.');
  }
  return absolutePath;
}

// Helper function to get the path for the snapshots JSON file.
// originalFilePathRelativeFromBase should be the path *as sent by the client*, relative to BASE_DIR or absolute if BASE_DIR is /.
function getSnapshotStorageInfo(originalFilePathRelativeFromBase: string): { snapshotDir: string, snapshotFilename: string, fullSnapshotPathForFs: string, relativeSnapshotPathForStorage: string } {
  const baseDirNormalized = path.normalize(BASE_DIR);
  
  // Determine the absolute path of the original file this snapshot belongs to
  let absoluteOriginalPath = path.normalize(path.join(baseDirNormalized, originalFilePathRelativeFromBase));
  if (BASE_DIR === '/' && originalFilePathRelativeFromBase.startsWith('/')) {
    absoluteOriginalPath = path.normalize(originalFilePathRelativeFromBase);
  }

  const originalDir = path.dirname(absoluteOriginalPath);
  const originalFilename = path.basename(absoluteOriginalPath);
  
  const sanitizedOriginalFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotFilename = `${sanitizedOriginalFilename}-snapshots.json`;
  
  // Full path for direct fs access (e.g., for checking directory existence)
  const fullSnapshotPathForFs = path.join(originalDir, snapshotFilename);

  // Path relative to dataPath used by storageService (which appends dataPath internally)
  let relativeSnapshotPathForStorage: string;
  if (BASE_DIR === '/') {
    // If BASE_DIR is root, originalFilePathRelativeFromBase is likely an absolute path.
    // We need its dirname relative to root, then append snapshot filename.
    const dirOfOriginalRelativeToRoot = path.dirname(originalFilePathRelativeFromBase.startsWith('/') ? originalFilePathRelativeFromBase.substring(1) : originalFilePathRelativeFromBase);
    relativeSnapshotPathForStorage = path.join(dirOfOriginalRelativeToRoot === '.' ? '' : dirOfOriginalRelativeToRoot, snapshotFilename).replace(/\\/g, '/');
  } else {
    // If BASE_DIR is specific, originalFilePathRelativeFromBase is relative to it.
    // We need to make it relative to dataPath's root if dataPath is different from BASE_DIR,
    // or simply use the structure if dataPath *is* BASE_DIR or a sub-path.
    // For simplicity now, assuming storageService handles dataPath correctly and we provide path relative to "file system structure within dataPath"
    const dirOfRelativeOriginal = path.dirname(originalFilePathRelativeFromBase);
    relativeSnapshotPathForStorage = path.join(dirOfRelativeOriginal === '.' ? '' : dirOfRelativeOriginal, snapshotFilename).replace(/\\/g, '/');
  }
   if (relativeSnapshotPathForStorage.startsWith('/')) {
    relativeSnapshotPathForStorage = relativeSnapshotPathForStorage.substring(1);
  }
  
  return { 
    snapshotDir: originalDir, // Absolute path to directory containing the original file
    snapshotFilename, 
    fullSnapshotPathForFs, // Absolute path to the snapshot JSON file
    relativeSnapshotPathForStorage // Path used as key for storageService (relative to its root)
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const originalFilePathRelative = searchParams.get('filePath');
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
        return NextResponse.json({ snapshots: [] }, { status: 200 }); 
    }

    const { relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);
    if (debugMode) console.log(`[API /snapshots GET] Attempting to load snapshots using storage key: ${relativeSnapshotPathForStorage} for original file: ${originalFilePathRelative}`);

    const data = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;

    if (data && Array.isArray(data.snapshots)) {
      if (debugMode) console.log(`[API /snapshots GET] Successfully loaded ${data.snapshots.length} snapshots for ${originalFilePathRelative}`);
      return NextResponse.json({ snapshots: data.snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
    } else {
      if (debugMode) console.log(`[API /snapshots GET] No snapshots found or invalid format for ${originalFilePathRelative} (key: ${relativeSnapshotPathForStorage}), returning empty array.`);
      return NextResponse.json({ snapshots: [] }, { status: 200 });
    }
  } catch (error: any) {
    console.error(`[API /snapshots GET] Error listing snapshots for ${originalFilePathRelative}:`, error.message, error.stack);
    if (error.message?.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    // Ensure a JSON response for other errors too
    return NextResponse.json({ error: 'Failed to list snapshots.', details: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;
  let body;

  try {
    try {
      body = await request.json();
      if (debugMode) console.log("[API /snapshots POST] Received body:", body);
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
    
    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative);
    if (!fs.existsSync(safeOriginalFilePath) || fs.statSync(safeOriginalFilePath).isDirectory()) {
        if (debugMode) console.warn(`[API /snapshots POST] Original file for snapshot not found or is a directory: ${safeOriginalFilePath}`);
        return NextResponse.json({ error: 'Original file not found or is a directory, cannot create snapshot.' }, { status: 404 });
    }

    const { relativeSnapshotPathForStorage, snapshotDir, fullSnapshotPathForFs } = getSnapshotStorageInfo(originalFilePathRelative);
    if (debugMode) console.log(`[API /snapshots POST] Creating snapshot for: ${originalFilePathRelative}. Storing with key: ${relativeSnapshotPathForStorage}. Snapshot file will be in dir: ${snapshotDir}`);
    
    try {
        // Ensure the directory for the snapshot file exists (storageService's dataPath + relative path)
        // Note: storageService's ensureDataDirectoryExists only ensures its root dataPath.
        // We need to ensure the subdirectories for snapshots (mirroring original file structure) also exist.
        const fullDirForSnapshotFile = path.dirname(fullSnapshotPathForFs);
        if (!fs.existsSync(fullDirForSnapshotFile)) {
            fs.mkdirSync(fullDirForSnapshotFile, { recursive: true });
            if (debugMode) console.log(`[API /snapshots POST] Created snapshot file directory: ${fullDirForSnapshotFile}`);
        }
        fs.accessSync(fullDirForSnapshotFile, fs.constants.W_OK);
    } catch(e: any) {
        const accessErrorMsg = `Permission issue or error creating snapshot directory for ${relativeSnapshotPathForStorage}. Ensure server has write access to ${snapshotDir}.`;
        console.error(`[API /snapshots POST] ${accessErrorMsg} Error: ${e.message}, Stack: ${e.stack}`);
        return NextResponse.json({ error: accessErrorMsg, details: e.message }, { status: 500 });
    }

    let existingSnapshots: Snapshot[] = [];
    try {
      const currentSnapshotData = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;
      if (currentSnapshotData && Array.isArray(currentSnapshotData.snapshots)) {
        existingSnapshots = currentSnapshotData.snapshots;
        if (debugMode) console.log(`[API /snapshots POST] Loaded ${existingSnapshots.length} existing snapshots for ${relativeSnapshotPathForStorage}`);
      } else if (debugMode) {
        console.log(`[API /snapshots POST] No existing snapshots file or invalid format for ${relativeSnapshotPathForStorage}. Starting new list.`);
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
    
    // Sort unlocked snapshots by timestamp (oldest first) for pruning
    unlockedSnapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const totalAllowedSnapshots = MAX_SERVER_SNAPSHOTS;
    const numUnlockedToKeep = Math.max(0, totalAllowedSnapshots - lockedSnapshots.length);

    if (unlockedSnapshots.length > numUnlockedToKeep) {
        const numToPrune = unlockedSnapshots.length - numUnlockedToKeep;
        if (debugMode) console.log(`[API /snapshots POST] Pruning ${numToPrune} oldest unlocked snapshot(s) for ${originalFilePathRelative}. Keeping ${numUnlockedToKeep} unlocked.`);
        unlockedSnapshots = unlockedSnapshots.slice(numToPrune);
    }
    
    let finalSnapshots = [...lockedSnapshots, ...unlockedSnapshots];
    // Sort final list by timestamp (newest first) for consistency before saving
    finalSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); 
    
    if (lockedSnapshots.length >= totalAllowedSnapshots && !finalSnapshots.some(s => s.id === newSnapshot.id)) {
        const lockedErrorMsg = `Cannot create new snapshot for ${path.basename(originalFilePathRelative)}. All ${totalAllowedSnapshots} snapshot slots are effectively filled by locked snapshots. Unlock some or delete them.`;
        if (debugMode) console.warn(`[API /snapshots POST] ${lockedErrorMsg}`);
        // Return the state *before* attempting to add the new snapshot, effectively rejecting the creation
        const snapshotsBeforeAttempt = existingSnapshots.filter(s => s.id !== newSnapshot.id);
        return NextResponse.json({ 
            error: lockedErrorMsg,
            snapshots: snapshotsBeforeAttempt.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) 
        }, { status: 400 });
    }
    
    const dataToSave: SnapshotFile = { snapshots: finalSnapshots };
    if (debugMode) console.log(`[API /snapshots POST] About to save ${finalSnapshots.length} snapshots to ${relativeSnapshotPathForStorage}. Data:`, JSON.stringify(dataToSave).substring(0, 200) + "...");
    
    await saveEncryptedData(relativeSnapshotPathForStorage, dataToSave);

    if (debugMode) console.log(`[API /snapshots POST] Snapshot created and saved for ${originalFilePathRelative}. Total snapshots: ${finalSnapshots.length}`);
    return NextResponse.json({ success: true, message: 'Snapshot created successfully.', snapshots: finalSnapshots });

  } catch (error: any) {
    const errorMsg = error.message || "An unknown error occurred while creating snapshot.";
    const errorStack = error.stack;
    console.error(`[API /snapshots POST] CRITICAL UNHANDLED ERROR creating snapshot for path ${body?.filePath || 'unknown'}:`, errorMsg, errorStack);
    return NextResponse.json({ 
        error: 'Failed to create snapshot due to an unexpected server error.', 
        details: debugMode ? errorMsg : "Internal server error.",
        stack: debugMode ? errorStack : undefined 
    }, { status: 500 });
  }
}

// TODO: Implement routes/logic for:
// - PUT /api/panel-daemon/snapshots/{snapshotId}/lock (or POST with action: 'toggleLock')
// - DELETE /api/panel-daemon/snapshots/{snapshotId} (or POST with action: 'delete')

