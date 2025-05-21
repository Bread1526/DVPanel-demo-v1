
// src/app/api/panel-daemon/snapshots/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { v4 as uuidv4 } from 'uuid';
import type { Snapshot } from '@/app/(app)/files/editor/[...filePath]/page';

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';
const MAX_SNAPSHOTS = 10; // Max number of snapshots to keep per file (excluding locked ones)

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

// Helper to get the path for the snapshot storage file
function getSnapshotStorageInfo(originalFilePathRelative: string): { snapshotDir: string, snapshotFilename: string, fullSnapshotPath: string, relativeSnapshotPathForStorage: string } {
  const absoluteOriginalPath = resolveSafePath(originalFilePathRelative); // Validates original file path
  const originalDir = path.dirname(absoluteOriginalPath);
  const originalFilename = path.basename(absoluteOriginalPath);
  
  // Create a sanitized snapshot filename to avoid issues if originalFilename has special chars
  const sanitizedOriginalFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotFilename = `${sanitizedOriginalFilename}-snapshots.json`;
  const fullSnapshotPath = path.join(originalDir, snapshotFilename);

  // The path used for load/saveEncryptedData should be relative to getDataPath() or based on its internal logic
  // Assuming loadEncryptedData and saveEncryptedData expect a filename to be placed in a specific data directory (e.g., .dvpanel_data)
  // OR they expect a path relative to the project root if they construct paths from getDataPath() + filename.
  // For snapshots stored alongside the file, we need to pass a path that storageService can resolve.
  // If storageService prepends getDataPath(), this needs careful handling.
  // Let's assume storageService can handle paths relative to BASE_DIR if we make it smart,
  // or we pass paths that are already within a managed data area.
  // For snapshots alongside the file, the path is relative to the *file's* location.
  // storageService would need to be able to write outside of getDataPath() for this,
  // or we store snapshot metadata in getDataPath() and snapshot content elsewhere.
  // For simplicity NOW, we'll assume storageService is writing to a path relative to the project root.
  // This means originalFilePathRelative needs to be the key.
  // We will store the snapshot file in the same directory as the original file.
  const relativeSnapshotPathForStorage = path.join(path.dirname(originalFilePathRelative), snapshotFilename);
  
  return { snapshotDir: originalDir, snapshotFilename, fullSnapshotPath, relativeSnapshotPathForStorage };
}


// GET handler to list snapshots
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const originalFilePathRelative = searchParams.get('filePath');

  if (!originalFilePathRelative) {
    return NextResponse.json({ error: 'filePath query parameter is required.' }, { status: 400 });
  }

  try {
    // Validate original file path first to ensure it's accessible
    resolveSafePath(originalFilePathRelative); 
    
    const { relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);
    console.log(`[API /snapshots GET] Attempting to load snapshots using storage key: ${relativeSnapshotPathForStorage}`);

    const data = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;

    if (data && Array.isArray(data.snapshots)) {
      console.log(`[API /snapshots GET] Successfully loaded ${data.snapshots.length} snapshots for ${originalFilePathRelative}`);
      return NextResponse.json({ snapshots: data.snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) }); // Sort newest first
    } else {
      console.log(`[API /snapshots GET] No snapshots found or invalid format for ${originalFilePathRelative}, returning empty array.`);
      return NextResponse.json({ snapshots: [] });
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
  try {
    const body = await request.json();
    const { filePath: originalFilePathRelative, content, language } = body;

    if (!originalFilePathRelative || typeof originalFilePathRelative !== 'string') {
      return NextResponse.json({ error: 'Original file path is required.' }, { status: 400 });
    }
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Snapshot content is required.' }, { status: 400 });
    }
    if (typeof language !== 'string') {
      return NextResponse.json({ error: 'Snapshot language is required.' }, { status: 400 });
    }

    // Validate original file path first
    resolveSafePath(originalFilePathRelative);

    const { snapshotDir, relativeSnapshotPathForStorage } = getSnapshotStorageInfo(originalFilePathRelative);

    console.log(`[API /snapshots POST] Creating snapshot for: ${originalFilePathRelative}. Storing with key: ${relativeSnapshotPathForStorage}`);

    // Check writability of the directory where snapshot file will be stored
    try {
        fs.accessSync(snapshotDir, fs.constants.W_OK);
    } catch(e: any) {
        console.error(`[API /snapshots POST] Permission denied: Cannot write to snapshot directory ${snapshotDir} (for file ${originalFilePathRelative}). Error: ${e.message}`);
        return NextResponse.json({ error: `Permission denied to write snapshots in directory for ${originalFilePathRelative}.`, details: e.message}, { status: 403 });
    }

    let existingSnapshots: Snapshot[] = [];
    const currentSnapshotData = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;
    if (currentSnapshotData && Array.isArray(currentSnapshotData.snapshots)) {
      existingSnapshots = currentSnapshotData.snapshots;
    }

    const newSnapshot: Snapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      content,
      language,
      isLocked: false, // New snapshots are not locked by default
    };

    existingSnapshots.unshift(newSnapshot); // Add new snapshot to the beginning

    // Pruning logic
    const lockedSnapshots = existingSnapshots.filter(s => s.isLocked);
    const unlockedSnapshots = existingSnapshots.filter(s => !s.isLocked).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // Oldest unlocked first

    let finalSnapshots = [...lockedSnapshots];
    const remainingSlots = MAX_SERVER_SNAPSHOTS - lockedSnapshots.length;
    
    if (remainingSlots < 0) { // More locked snapshots than allowed total
        console.warn(`[API /snapshots POST] Too many locked snapshots for ${originalFilePathRelative}. Max allowed: ${MAX_SERVER_SNAPSHOTS}, Locked: ${lockedSnapshots.length}. Cannot create new snapshot.`);
        return NextResponse.json({ error: `Cannot create new snapshot. All ${MAX_SERVER_SNAPSHOTS} slots effectively filled by locked snapshots. Please unlock some.`, snapshots: existingSnapshots.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) }, { status: 400 });
    }

    const unlockedSnapshotsToKeep = unlockedSnapshots.slice(-remainingSlots); // Keep the newest unlocked ones
    finalSnapshots.push(...unlockedSnapshotsToKeep);
    
    finalSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort all by timestamp desc

    if (finalSnapshots.length > existingSnapshots.length && lockedSnapshots.length >= MAX_SERVER_SNAPSHOTS) {
        // This case means a new snapshot was added, but all slots were effectively locked. This shouldn't happen due to above check.
        // However, if newSnapshot pushed it over and all others were locked.
        console.warn(`[API /snapshots POST] Cannot create snapshot for ${originalFilePathRelative}. All ${MAX_SERVER_SNAPSHOTS} snapshot slots are filled by locked snapshots.`);
        return NextResponse.json({ error: `Cannot create new snapshot. All ${MAX_SERVER_SNAPSHOTS} snapshot slots are filled by locked snapshots. Unlock some or delete manually.`, snapshots: existingSnapshots.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) }, { status: 400 });
    }
    
    if (existingSnapshots.length > finalSnapshots.length) {
        console.log(`[API /snapshots POST] Pruned ${existingSnapshots.length - finalSnapshots.length} old unlocked snapshot(s) for ${originalFilePathRelative}.`);
    }
    
    const dataToSave: SnapshotFile = { snapshots: finalSnapshots };
    await saveEncryptedData(relativeSnapshotPathForStorage, dataToSave);

    console.log(`[API /snapshots POST] Snapshot created and saved for ${originalFilePathRelative}. Total snapshots: ${finalSnapshots.length}`);
    return NextResponse.json({ success: true, message: 'Snapshot created.', snapshots: finalSnapshots });

  } catch (error: any) {
    console.error(`[API /snapshots POST] Error creating snapshot for path ${body?.filePath || 'unknown'}:`, error.message, error.stack);
     if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${body?.filePath}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to create snapshot.', details: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }, { status: 500 });
  }
}

// Placeholder for DELETE and PUT for individual snapshot operations (lock/unlock)
// These would typically be under a route like /api/panel-daemon/snapshots/[snapshotId]
// or handled by this route with an 'action' field in the request body.

