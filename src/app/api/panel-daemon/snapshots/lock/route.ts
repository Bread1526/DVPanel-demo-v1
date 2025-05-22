
// src/app/api/panel-daemon/snapshots/lock/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadEncryptedData, saveEncryptedData } from "@/backend/services/storageService";
import type { Snapshot } from '@/app/(app)/files/components/editor-dialog';
import { loadPanelSettings } from '@/app/(app)/settings/actions';
import { getDataPath } from '@/backend/lib/config';

const FILE_MANAGER_BASE_DIR = process.env.FILE_MANAGER_BASE_DIR || '/';

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
    console.warn(`[API Security /snapshots/lock - resolveSafeOriginalFilePath] Attempt to use absolute path '${normalizedUserPath}' when FILE_MANAGER_BASE_DIR is '${FILE_MANAGER_BASE_DIR}'. Treating as relative to FILE_MANAGER_BASE_DIR's root.`);
    absolutePath = path.normalize(path.join(FILE_MANAGER_BASE_DIR, path.basename(normalizedUserPath)));
  } else {
    absolutePath = path.normalize(path.join(FILE_MANAGER_BASE_DIR, normalizedUserPath));
  }

  if (FILE_MANAGER_BASE_DIR === '/') {
    if (!path.isAbsolute(absolutePath)) {
      const constructionErrorMsg = `[API Security /snapshots/lock - resolveSafeOriginalFilePath] Path construction error (Not Absolute): relativePath='${relativePath}', absolutePath='${absolutePath}', FILE_MANAGER_BASE_DIR='${FILE_MANAGER_BASE_DIR}'`;
      console.error(constructionErrorMsg);
      throw new Error('Access denied: Invalid path resolution for original file.');
    }
  } else if (!absolutePath.startsWith(FILE_MANAGER_BASE_DIR + path.sep) && absolutePath !== FILE_MANAGER_BASE_DIR) {
    const accessDeniedMsg = `[API Security /snapshots/lock - resolveSafeOriginalFilePath] Access Denied (Outside Base Directory): relativePath='${relativePath}', normalizedUserPath='${normalizedUserPath}', absolutePath='${absolutePath}', FILE_MANAGER_BASE_DIR='${FILE_MANAGER_BASE_DIR}'`;
    console.error(accessDeniedMsg);
    throw new Error('Access denied: Original file path is outside the allowed directory.');
  }
  return absolutePath;
}

// Helper to get snapshot storage path info
function getSnapshotStorageInfo(originalFilePathRelativeFromBase: string): {
  relativeSnapshotPathForStorage: string; 
  fullSnapshotDirForFs: string; 
} {
  let inputPath = originalFilePathRelativeFromBase;
  if (inputPath.startsWith('/')) {
    inputPath = inputPath.substring(1);
  }
  
  const originalFilename = path.basename(inputPath);
  const originalDirRelativeToBase = path.dirname(inputPath);
  
  const sanitizedOriginalFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const snapshotFilenameOnly = `${sanitizedOriginalFilename}-snapshots.json`;

  const relativeDirPathForStorage = originalDirRelativeToBase === '.' ? '' : originalDirRelativeToBase;
  
  const finalRelativeSnapshotPathForStorage = path.join(
    relativeDirPathForStorage,
    snapshotFilenameOnly
  ).replace(/\\/g, '/');

  const dataPath = getDataPath();
  const fullSnapshotDirForFs = path.resolve(dataPath, relativeDirPathForStorage);

  return {
    relativeSnapshotPathForStorage: finalRelativeSnapshotPathForStorage,
    fullSnapshotDirForFs
  };
}


export async function POST(request: NextRequest) {
  const panelSettingsResult = await loadPanelSettings();
  const debugMode = panelSettingsResult.data?.debugMode ?? false;
  let body;

  try {
    try {
      body = await request.json();
      if (debugMode) console.log("[API /snapshots/lock POST] Received body for lock/unlock:", body);
    } catch (e: any) {
      if (debugMode) console.warn("[API /snapshots/lock POST] Invalid JSON in request body:", e.message);
      return NextResponse.json({ error: "Invalid JSON in request body.", details: e.message }, { status: 400 });
    }

    const { filePath: originalFilePathRelative, snapshotId, lock } = body;

    if (!originalFilePathRelative || typeof originalFilePathRelative !== 'string' ||
        !snapshotId || typeof snapshotId !== 'string' ||
        typeof lock !== 'boolean') {
      if (debugMode) console.warn("[API /snapshots/lock POST] Missing required fields: filePath, snapshotId, or lock status.");
      return NextResponse.json({ error: 'Missing required fields: filePath (string), snapshotId (string), lock (boolean).' }, { status: 400 });
    }
    
    const safeOriginalFilePath = resolveSafeOriginalFilePath(originalFilePathRelative);
    if (!fs.existsSync(safeOriginalFilePath)) {
      if (debugMode) console.warn(`[API /snapshots/lock POST] Original file not found: ${safeOriginalFilePath}`);
      return NextResponse.json({ error: 'Original file not found, cannot update snapshot lock.' }, { status: 404 });
    }

    const { relativeSnapshotPathForStorage, fullSnapshotDirForFs } = getSnapshotStorageInfo(originalFilePathRelative);
    
    if (!fs.existsSync(path.join(fullSnapshotDirForFs, path.basename(relativeSnapshotPathForStorage)))) {
        if (debugMode) console.log(`[API /snapshots/lock POST] Snapshot file not found for ${originalFilePathRelative}, cannot update lock status.`);
        return NextResponse.json({ error: 'Snapshot file not found. Cannot update lock status.', snapshots: [] }, { status: 404 });
    }

    const currentSnapshotData = await loadEncryptedData(relativeSnapshotPathForStorage) as SnapshotFile | null;
    if (!currentSnapshotData || !Array.isArray(currentSnapshotData.snapshots)) {
      if (debugMode) console.log(`[API /snapshots/lock POST] No snapshots found or invalid format for ${originalFilePathRelative}.`);
      return NextResponse.json({ error: 'No snapshots found to update lock status.', snapshots: [] }, { status: 404 });
    }

    let snapshotFound = false;
    const updatedSnapshots = currentSnapshotData.snapshots.map(snap => {
      if (snap.id === snapshotId) {
        snapshotFound = true;
        return { ...snap, isLocked: lock };
      }
      return snap;
    });

    if (!snapshotFound) {
      if (debugMode) console.warn(`[API /snapshots/lock POST] Snapshot ID ${snapshotId} not found in file ${relativeSnapshotPathForStorage}.`);
      return NextResponse.json({ error: `Snapshot ID ${snapshotId} not found.`, snapshots: currentSnapshotData.snapshots }, { status: 404 });
    }

    await saveEncryptedData(relativeSnapshotPathForStorage, { snapshots: updatedSnapshots });
    if (debugMode) console.log(`[API /snapshots/lock POST] Snapshot ${snapshotId} lock status updated to ${lock} for ${originalFilePathRelative}.`);
    
    const sortedSnapshots = updatedSnapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return NextResponse.json({ success: true, message: `Snapshot ${lock ? 'locked' : 'unlocked'} successfully.`, snapshots: sortedSnapshots });

  } catch (error: any) {
    console.error(`[API /snapshots/lock POST] Error updating snapshot lock for ${body?.filePath || 'unknown'}:`, error.message, error.stack);
    if (error.message?.startsWith('Access denied')) {
      return NextResponse.json({ error: error.message, details: `Path: ${body?.filePath}` }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to update snapshot lock status.', details: debugMode ? error.message : "Internal server error." , stack: debugMode ? error.stack : undefined }, { status: 500 });
  }
}

    