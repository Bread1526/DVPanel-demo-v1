
// src/app/api/panel-daemon/snapshots/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { v4 as uuidv4 } from 'uuid';
import type { Snapshot } from '@/app/(app)/files/editor/[...filePath]/page'; // Assuming Snapshot type is here
import { loadPanelSettings } from '@/app/(app)/settings/actions';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';
const MAX_SERVER_SNAPSHOTS = 10; // Max number of snapshots to keep per file (excluding locked ones)

interface SnapshotFile {
  snapshots: Snapshot[];
}

// Helper function to resolve safe paths, ensuring access is within BASE_DIR
function resolveSafePath(relativePath: string): string {
  const normalizedUserPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  let absolutePath: string;

  if (path.isAbsolute(normalizedUserPath) && BASE_DIR === '/') {
    absolutePath = normalizedUserPath;
  } else if (path.isAbsolute(normalizedUserPath) && BASE_DIR !== '/') {
    console.warn(`[API Security /snapshots] Attempt to use absolute path '${normalizedUserPath}' when BASE_DIR is '${BASE_DIR}'. Treating as relative to BASE_DIR's root.`);
    absolutePath = path.normalize(path.join(BASE_DIR, path.basename(normalizedUserPath)));
  } else {
    absolutePath = path.normalize(path.join(BASE_DIR, normalizedUserPath));
  }

  if (BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      console.error(`[API Security /snapshots] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
      throw new Error('Access denied: Invalid path resolution.');
    }
  } else if (!absolutePath.startsWith(BASE_DIR + path.sep) && absolutePath !== BASE_DIR) {
    console.error(`[API Security /snapshots] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', BASE_DIR='${BASE_DIR}'`);
    throw new Error('Access denied: Path is outside the allowed directory.');
  }
  return absolutePath;
}

function getSnapshotStorageInfo(originalFilePathRelative: string): { snapshotDir: string, snapshotFilename: string, fullSnapshotPath: string, relativeSnapshotPathForStorage: string } {
  const absoluteOriginalPath = resolveSafePath(originalFilePathRelative);
  const originalDir = path.dirname(absoluteOriginalPath);
  const originalFilename = path.basename(absoluteOriginalPath);
  
  const sanitizedOriginalFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotFilename = `${sanitizedOriginalFilename}-snapshots.json`;
  const fullSnapshotPath = path.join(originalDir, snapshotFilename);

  // Path used for storageService should be relative to where storageService expects it.
  // Assuming storageService places files within the main data directory.
  // We need a unique key for storageService. Using the original file's relative path and appending -snapshots.json ensures uniqueness.
  const relativeSnapshotPathForStorage = `${originalFilePathRelative}-snapshots.json`;
  
  return { snapshotDir: originalDir, snapshotFilename, fullSnapshotPath, relativeSnapshotPathForStorage };
}

// GET handler to list snapshots
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
    // Validate original file path first to ensure it's accessible before trying to construct snapshot path
    resolveSafePath(originalFilePathRelative); 
    
    const { relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);
    if (debugMode) console.log(`[API /snapshots GET] Attempting to load snapshots using storage key: ${relativeSnapshotPathForStorage} for original file: ${originalFilePathRelative}`);

    const data = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;

    if (data && Array.isArray(data.snapshots)) {
      if (debugMode) console.log(`[API /snapshots GET] Successfully loaded ${data.snapshots.length} snapshots for ${originalFilePathRelative}`);
      return NextResponse.json({ snapshots: data.snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
    } else {
      if (debugMode) console.log(`[API /snapshots GET] No snapshots found or invalid format for ${originalFilePathRelative} (key: ${relativeSnapshotPathForStorage}), returning empty array.`);
      return NextResponse.json({ snapshots: [] }); // Ensure valid JSON empty array is returned
    }
  } catch (error: any) {
    console.error(`[API /snapshots GET] Error listing snapshots for ${originalFilePathRelative}:`, error.message, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to list snapshots.', details: error.message }, { status: 500 });
  }
}

// POST handler to create a snapshot
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
    if (debugMode) console.warn("[API /snapshots POST] 'filePath' is required in body.");
    return NextResponse.json({ error: 'Original file path is required.' }, { status: 400 });
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
    // Validate original file path
    const absoluteOriginalPath = resolveSafePath(originalFilePathRelative);
    const { snapshotDir, relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);

    if (debugMode) console.log(`[API /snapshots POST] Creating snapshot for: ${originalFilePathRelative}. Storing with key: ${relativeSnapshotPathForStorage}`);

    // Check writability of the directory where snapshot file will be stored
    // Note: This check needs to be adapted if relativeSnapshotPathForStorage is not in the same dir.
    // For now, storageService handles actual file writing and its permissions.
    try {
        fs.accessSync(snapshotDir, fs.constants.W_OK);
    } catch(e: any) {
        console.error(`[API /snapshots POST] Permission denied: Cannot write to snapshot directory ${snapshotDir} (for file ${originalFilePathRelative}). Error: ${e.message}`);
        // This is a high-level check. saveEncryptedData will handle the actual file write and its specific errors.
    }

    let existingSnapshots: Snapshot[] = [];
    try {
      const currentSnapshotData = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;
      if (currentSnapshotData && Array.isArray(currentSnapshotData.snapshots)) {
        existingSnapshots = currentSnapshotData.snapshots;
      }
    } catch (loadError: any) {
      if (debugMode) console.warn(`[API /snapshots POST] Error loading existing snapshots for ${relativeSnapshotPathForStorage}, starting fresh. Error: ${loadError.message}`);
      // Proceed with empty existingSnapshots
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
        if (debugMode) console.log(`[API /snapshots POST] Pruning ${numToPrune} oldest unlocked snapshot(s) for ${originalFilePathRelative}.`);
        unlockedSnapshots = unlockedSnapshots.slice(numToPrune);
    }
    
    const finalSnapshots = [...lockedSnapshots, ...unlockedSnapshots];
    finalSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort all by timestamp desc for consistency

    if (existingSnapshots.length > 0 && lockedSnapshots.length >= totalAllowedSnapshots && !existingSnapshots.find(s => s.id === newSnapshot.id && s.isLocked)) {
        // This case means we tried to add a new snapshot, but all slots are effectively filled by locked ones.
        if (debugMode) console.warn(`[API /snapshots POST] Cannot create snapshot for ${originalFilePathRelative}. All ${totalAllowedSnapshots} snapshot slots are effectively filled by locked snapshots.`);
        return NextResponse.json({ error: `Cannot create new snapshot. All ${totalAllowedSnapshots} snapshot slots are effectively filled by locked snapshots. Unlock some or delete manually.`, snapshots: finalSnapshots.slice(1) }, { status: 400 }); // Return previous state
    }
    
    const dataToSave: SnapshotFile = { snapshots: finalSnapshots };
    await saveEncryptedData(relativeSnapshotPathForStorage, dataToSave);

    if (debugMode) console.log(`[API /snapshots POST] Snapshot created and saved for ${originalFilePathRelative}. Total snapshots: ${finalSnapshots.length}`);
    return NextResponse.json({ success: true, message: 'Snapshot created successfully.', snapshots: finalSnapshots });

  } catch (error: any) {
    console.error(`[API /snapshots POST] Error creating snapshot for path ${originalFilePathRelative || 'unknown'}:`, error.message, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${originalFilePathRelative}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to create snapshot.', details: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }, { status: 500 });
  }
}
