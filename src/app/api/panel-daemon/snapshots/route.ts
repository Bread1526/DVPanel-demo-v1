
// src/app/api/panel-daemon/snapshots/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import { v4 as uuidv4 } from 'uuid';
import type { Snapshot } from '@/app/(app)/files/editor/[...filePath]/page'; // Assuming Snapshot type is exported or accessible

const BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';
const MAX_SNAPSHOTS = 10;

interface SnapshotFile {
  snapshots: Snapshot[];
}

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

function getSnapshotFilePath(originalFilePathRelative: string): { snapshotDir: string, snapshotFilename: string, fullSnapshotPath: string } {
  const absoluteOriginalPath = resolveSafePath(originalFilePathRelative);
  const originalDir = path.dirname(absoluteOriginalPath);
  const originalFilename = path.basename(absoluteOriginalPath);
  const snapshotFilename = `${originalFilename}-snapshots.json`;
  const fullSnapshotPath = path.join(originalDir, snapshotFilename);
  
  // For resolveSafePath on the snapshot file, we need to ensure it's still within BASE_DIR
  // We use the originalDir which is already validated by resolveSafePath(originalFilePathRelative)
  // and then append snapshotFilename.
  // A re-validation step could be added if paranoid, but originalDir is already safe.

  return { snapshotDir: originalDir, snapshotFilename, fullSnapshotPath };
}

// GET handler to list snapshots
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const originalFilePathRelative = searchParams.get('filePath');

  if (!originalFilePathRelative) {
    return NextResponse.json({ error: 'filePath query parameter is required.' }, { status: 400 });
  }

  try {
    const { fullSnapshotPath, snapshotFilename } = getSnapshotFilePath(originalFilePathRelative);
    console.log(`[API /snapshots GET] Attempting to load snapshots from: ${fullSnapshotPath}`);

    const data = await loadEncryptedData(path.join(path.dirname(originalFilePathRelative), snapshotFilename)) as SnapshotFile | null;

    if (data && Array.isArray(data.snapshots)) {
      console.log(`[API /snapshots GET] Successfully loaded ${data.snapshots.length} snapshots for ${originalFilePathRelative}`);
      return NextResponse.json({ snapshots: data.snapshots });
    } else {
      console.log(`[API /snapshots GET] No snapshots found or invalid format for ${originalFilePathRelative}, returning empty array.`);
      return NextResponse.json({ snapshots: [] });
    }
  } catch (error: any) {
    console.error(`[API /snapshots GET] Error listing snapshots for ${originalFilePathRelative}:`, error.message, error.stack);
    if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
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

    const { snapshotDir, snapshotFilename, fullSnapshotPath } = getSnapshotFilePath(originalFilePathRelative);
    const relativeSnapshotPathForStorage = path.join(path.dirname(originalFilePathRelative), snapshotFilename);

    console.log(`[API /snapshots POST] Creating snapshot for: ${originalFilePathRelative}. Storing in: ${fullSnapshotPath}`);

    // Check writability of the directory where snapshot file will be stored
    try {
        fs.accessSync(snapshotDir, fs.constants.W_OK);
    } catch(e) {
        console.error(`[API /snapshots POST] Permission denied: Cannot write to snapshot directory ${snapshotDir}`);
        return NextResponse.json({ error: `Permission denied to write snapshots in directory for ${originalFilePathRelative}.`}, { status: 403 });
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
    if (existingSnapshots.length > MAX_SNAPSHOTS) {
      let removedCount = 0;
      const snapshotsToKeep: Snapshot[] = [];
      const lockedSnapshots: Snapshot[] = [];
      const unlockedSnapshots: Snapshot[] = [];

      existingSnapshots.forEach(s => s.isLocked ? lockedSnapshots.push(s) : unlockedSnapshots.push(s));
      
      // Keep all locked snapshots
      snapshotsToKeep.push(...lockedSnapshots);

      // Add unlocked snapshots, up to the limit
      const remainingSlots = MAX_SNAPSHOTS - lockedSnapshots.length;
      if (remainingSlots > 0) {
        snapshotsToKeep.push(...unlockedSnapshots.slice(0, remainingSlots));
      }
      
      removedCount = existingSnapshots.length - snapshotsToKeep.length;
      existingSnapshots = snapshotsToKeep.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Re-sort by timestamp desc

      if (removedCount === 0 && lockedSnapshots.length >= MAX_SNAPSHOTS) {
         // All slots are filled with locked snapshots, cannot add new one
         console.warn(`[API /snapshots POST] Cannot create snapshot for ${originalFilePathRelative}. All ${MAX_SNAPSHOTS} slots are locked.`);
         return NextResponse.json({ error: `Cannot create new snapshot. All ${MAX_SNAPSHOTS} snapshot slots are filled with locked snapshots. Unlock some or delete manually.` }, { status: 400 });
      }
      if (removedCount > 0) {
        console.log(`[API /snapshots POST] Pruned ${removedCount} old unlocked snapshot(s) for ${originalFilePathRelative}.`);
      }
    }
    
    const dataToSave: SnapshotFile = { snapshots: existingSnapshots };
    await saveEncryptedData(relativeSnapshotPathForStorage, dataToSave);

    console.log(`[API /snapshots POST] Snapshot created and saved for ${originalFilePathRelative}. Total snapshots: ${existingSnapshots.length}`);
    return NextResponse.json({ success: true, message: 'Snapshot created.', snapshots: existingSnapshots });

  } catch (error: any) {
    console.error('[API /snapshots POST] Error creating snapshot:', error.message, error.stack);
     if (error.message.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to create snapshot.', details: error.message }, { status: 500 });
  }
}
