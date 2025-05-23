
// src/app/api/panel-daemon/snapshots/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { v4 as uuidv4 } from 'uuid';
import type { Snapshot } from '@/app/(app)/files/components/editor-dialog';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { getDataPath } from '@/backend/lib/config';

const FILE_MANAGER_BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';
const MAX_SERVER_SNAPSHOTS = 10; 

interface SnapshotFile {
  snapshots: Snapshot[];
}

// Helper function to resolve safe paths for the *original file*
function resolveSafeOriginalFilePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (path.isAbsolute(normalizedUserPath) && FILE_MANAGER_BASE_DIR === '/') {
    absolutePath = normalizedUserPath;
  } else if (path.isAbsolute(normalizedUserPath) && FILE_MANAGER_BASE_DIR !== '/') {
    console.warn(`[API Security /snapshots - resolveSafeOriginalFilePath] Attempt to use absolute path '${normalizedUserPath}' when FILE_MANAGER_BASE_DIR is '${FILE_MANAGER_BASE_DIR}'. Treating as relative to FILE_MANAGER_BASE_DIR's root.`);
    absolutePath = path.normalize(path.join(FILE_MANAGER_BASE_DIR, path.basename(normalizedUserPath)));
  } else {
    absolutePath = path.normalize(path.join(FILE_MANAGER_BASE_DIR, normalizedUserPath));
  }

  if (FILE_MANAGER_BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      const constructionErrorMsg = `[API Security /snapshots - resolveSafeOriginalFilePath] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', FILE_MANAGER_BASE_DIR='${FILE_MANAGER_BASE_DIR}'`;
      console.error(constructionErrorMsg);
      throw new Error('Access denied: Invalid path resolution for original file.');
    }
  } else if (!absolutePath.startsWith(FILE_MANAGER_BASE_DIR + path.sep) && absolutePath !== FILE_MANAGER_BASE_DIR) {
    const accessDeniedMsg = `[API Security /snapshots - resolveSafeOriginalFilePath] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', FILE_MANAGER_BASE_DIR='${FILE_MANAGER_BASE_DIR}'`;
    console.error(accessDeniedMsg);
    throw new Error('Access denied: Original file path is outside the allowed directory.');
  }
  return absolutePath;
}


// Helper to get snapshot storage path info
// originalFilePathRelativeFromBase is relative to FILE_MANAGER_BASE_DIR
function getSnapshotStorageInfo(originalFilePathRelativeFromBase: string): {
  relativeSnapshotPathForStorage: string; // Path relative to getDataPath() for storageService
  fullSnapshotDirForFs: string; // Absolute FS path to the directory for the snapshot file
} {
  // Ensure the input path is treated as relative if it starts with /
  let inputPath = originalFilePathRelativeFromBase;
  if (inputPath.startsWith('/')) {
    inputPath = inputPath.substring(1);
  }
  
  const originalFilename = path.basename(inputPath);
  const originalDirRelativeToBase = path.dirname(inputPath);
  
  const sanitizedOriginalFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotFilenameOnly = `${sanitizedOriginalFilename}-snapshots.json`;

  // This will be the path segment *within* the dataPath
  const relativeDirPathForStorage = originalDirRelativeToBase === '.' ? '' : originalDirRelativeToBase;
  
  const finalRelativeSnapshotPathForStorage = path.join(
    relativeDirPathForStorage,
    snapshotFilenameOnly
  ).replace(/\\/g, '/');

  const dataPath = getDataPath(); // e.g., /home/user/studio/.dvpanel_data
  const fullSnapshotDirForFs = path.resolve(dataPath, relativeDirPathForStorage);

  return {
    relativeSnapshotPathForStorage: finalRelativeSnapshotPathForStorage,
    fullSnapshotDirForFs
  };
}


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const originalFilePathRelative = searchParams.get('filePath');
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (debugMode) console.log(`[API /snapshots GET] Request for filePath: ${originalFilePathRelative}`);

  if (!originalFilePathRelative) {
    if (debugMode) console.warn("[API /snapshots GET] 'filePath' query parameter is required.");
    return NextResponse.json({ error: 'filePath query parameter is required.' }, { status: 400 });
  }

  try {
    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative); // Validates against FILE_MANAGER_BASE_DIR
    if (!fs.existsSync(safeOriginalFilePath) || fs.statSync(safeOriginalFilePath).isDirectory()) {
      if (debugMode) console.warn(`[API /snapshots GET] Original file for which snapshots are requested not found or is a directory: ${safeOriginalFilePath}`);
      return NextResponse.json({ snapshots: [] });
    }

    const { relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);
    if (debugMode) console.log(`[API /snapshots GET] Attempting to load snapshots using storage key: ${relativeSnapshotPathForStorage} for original file: ${originalFilePathRelative}`);

    const data = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;

    if (data && Array.isArray(data.snapshots)) {
      if (debugMode) console.log(`[API /snapshots GET] Successfully loaded ${data.snapshots.length} snapshots for ${originalFilePathRelative}`);
      const sortedSnapshots = data.snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return NextResponse.json({ snapshots: sortedSnapshots });
    } else {
      if (debugMode) console.log(`[API /snapshots GET] No snapshots found or invalid format for ${originalFilePathRelative} (key: ${relativeSnapshotPathForStorage}), returning empty array.`);
      return NextResponse.json({ snapshots: [] });
    }
  } catch (error: any) {
    console.error(`[API /snapshots GET] Error listing snapshots for ${originalFilePathRelative}:`, error.message, error.stack);
    if (error.message?.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list snapshots.', details: debugMode ? error.message : "Internal server error." , stack: debugMode ? error.stack : undefined }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { // Create snapshot
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;
  let body;

  try {
    try {
      body = await request.json();
      if (debugMode) console.log("[API /snapshots POST] Received body for snapshot creation:", JSON.stringify(body).substring(0, 200) + "...");
    } catch (e: any) {
      if (debugMode) console.warn("[API /snapshots POST] Invalid JSON in request body:", e.message);
      return NextResponse.json({ error: "Invalid JSON in request body.", details: e.message }, { status: 400 });
    }

    const { filePath: originalFilePathRelative, content, language } = body;

    if (!originalFilePathRelative || typeof originalFilePathRelative !== 'string') {
      if (debugMode) console.warn("[API /snapshots POST] 'filePath' (original file path) is required in body.");
      return NextResponse.json({ error: 'Original file path (filePath) is required.' }, { status: 400 });
    }
     // Further validation for content and language can be added here if necessary

    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative);
    if (!fs.existsSync(safeOriginalFilePath) || fs.statSync(safeOriginalFilePath).isDirectory()) {
      if (debugMode) console.warn(`[API /snapshots POST] Original file for snapshot not found or is a directory: ${safeOriginalFilePath}`);
      return NextResponse.json({ error: 'Original file not found or is a directory, cannot create snapshot.', details: `Path: ${originalFilePathRelative}` }, { status: 404 });
    }

    const { relativeSnapshotPathForStorage, fullSnapshotDirForFs } = getSnapshotStorageInfo(originalFilePathRelative);
    if (debugMode) console.log(`[API /snapshots POST] Creating snapshot for: ${originalFilePathRelative}. Storage key: ${relativeSnapshotPathForStorage}. FS Snapshot Dir: ${fullSnapshotDirForFs}`);

    try {
      if (!fs.existsSync(fullSnapshotDirForFs)) {
        fs.mkdirSync(fullSnapshotDirForFs, { recursive: true });
        if (debugMode) console.log(`[API /snapshots POST] Created snapshot file directory: ${fullSnapshotDirForFs}`);
      }
      fs.accessSync(fullSnapshotDirForFs, fs.constants.W_OK);
    } catch (e: any) {
      const dirErrorMsg = `Failed to prepare/access snapshot directory at ${fullSnapshotDirForFs}. Ensure server has write permissions.`;
      console.error(`[API /snapshots POST] ${dirErrorMsg} System Error: ${e.message}`, e.stack);
      return NextResponse.json({ error: dirErrorMsg, details: e.message, stack: debugMode ? e.stack : undefined }, { status: 500 });
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
      content: content,
      language: language,
      isLocked: false,
    };

    existingSnapshots.unshift(newSnapshot); // Add to the beginning
    let lockedSnapshots = existingSnapshots.filter(s => s.isLocked);
    let unlockedSnapshots = existingSnapshots.filter(s => !s.isLocked);

    // Sort unlocked snapshots: oldest first to prune them
    unlockedSnapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const numUnlockedToKeep = Math.max(0, MAX_SERVER_SNAPSHOTS - lockedSnapshots.length);

    if (lockedSnapshots.length >= MAX_SERVER_SNAPSHOTS && !newSnapshot.isLocked /* new ones are never locked initially */) {
        const lockedErrorMsg = `Cannot create new snapshot for ${path.basename(originalFilePathRelative)}. All ${MAX_SERVER_SNAPSHOTS} snapshot slots are effectively filled by locked snapshots. Unlock some or delete them.`;
        if (debugMode) console.warn(`[API /snapshots POST] ${lockedErrorMsg}`);
        const snapshotsBeforeAttempt = existingSnapshots.filter(s => s.id !== newSnapshot.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return NextResponse.json({ error: lockedErrorMsg, snapshots: snapshotsBeforeAttempt, details: lockedErrorMsg }, { status: 400 });
    }
    
    if (unlockedSnapshots.length > numUnlockedToKeep) {
      const numToPrune = unlockedSnapshots.length - numUnlockedToKeep;
      if (debugMode) console.log(`[API /snapshots POST] Pruning ${numToPrune} oldest unlocked snapshot(s) for ${originalFilePathRelative}. Keeping ${numUnlockedToKeep} unlocked.`);
      unlockedSnapshots = unlockedSnapshots.slice(numToPrune); 
    }

    let finalSnapshots = [...lockedSnapshots, ...unlockedSnapshots];
    finalSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Newest first for API response

    await saveEncryptedData(relativeSnapshotPathForStorage, { snapshots: finalSnapshots });

    if (debugMode) console.log(`[API /snapshots POST] Snapshot created and saved for ${originalFilePathRelative}. Total snapshots now: ${finalSnapshots.length}`);
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

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const originalFilePathRelative = searchParams.get('filePath');
  const snapshotIdToDelete = searchParams.get('snapshotId');
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (debugMode) console.log(`[API /snapshots DELETE] Request for filePath: ${originalFilePathRelative}, snapshotId: ${snapshotIdToDelete}`);

  if (!originalFilePathRelative || !snapshotIdToDelete) {
    if (debugMode) console.warn("[API /snapshots DELETE] 'filePath' and 'snapshotId' query parameters are required.");
    return NextResponse.json({ error: 'filePath and snapshotId query parameters are required.' }, { status: 400 });
  }

  try {
    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative);
    if (!fs.existsSync(safeOriginalFilePath)) {
      if (debugMode) console.warn(`[API /snapshots DELETE] Original file not found: ${safeOriginalFilePath}`);
      return NextResponse.json({ error: 'Original file not found, cannot delete snapshot.', snapshots: [] }, { status: 404 });
    }

    const { relativeSnapshotPathForStorage, fullSnapshotDirForFs } = getSnapshotStorageInfo(originalFilePathRelative);
    
    if (!fs.existsSync(path.join(fullSnapshotDirForFs, path.basename(relativeSnapshotPathForStorage)))) {
      if (debugMode) console.log(`[API /snapshots DELETE] Snapshot file not found for ${originalFilePathRelative}, no snapshots to delete.`);
      return NextResponse.json({ message: 'Snapshot not found.', snapshots: [] });
    }

    const currentSnapshotData = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;
    if (!currentSnapshotData || !Array.isArray(currentSnapshotData.snapshots) || currentSnapshotData.snapshots.length === 0) {
      if (debugMode) console.log(`[API /snapshots DELETE] No snapshots found for ${originalFilePathRelative} or file empty/invalid.`);
      return NextResponse.json({ message: 'Snapshot not found or no snapshots to delete.', snapshots: [] });
    }

    const updatedSnapshots = currentSnapshotData.snapshots.filter(snap => snap.id !== snapshotIdToDelete);

    if (updatedSnapshots.length === currentSnapshotData.snapshots.length) {
      if (debugMode) console.warn(`[API /snapshots DELETE] Snapshot ID ${snapshotIdToDelete} not found in file ${relativeSnapshotPathForStorage}. No change made.`);
    }

    await saveEncryptedData(relativeSnapshotPathForStorage, { snapshots: updatedSnapshots });
    if (debugMode) console.log(`[API /snapshots DELETE] Snapshot ${snapshotIdToDelete} processing complete for ${originalFilePathRelative}. ${updatedSnapshots.length} snapshots remaining.`);
    
    const sortedSnapshots = updatedSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json({ success: true, message: 'Snapshot deleted successfully.', snapshots: sortedSnapshots });

  } catch (error: any) {
    console.error(`[API /snapshots DELETE] Error deleting snapshot ${snapshotIdToDelete} for ${originalFilePathRelative}:`, error.message, error.stack);
    if (error.message?.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to delete snapshot.', details: debugMode ? error.message : "Internal server error." , stack: debugMode ? error.stack : undefined }, { status: 500 });
  }
}

    