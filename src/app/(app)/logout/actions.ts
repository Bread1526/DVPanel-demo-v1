
"use server";

import { redirect } from 'next/navigation';
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService"; // Assuming this service exists
import { getDataPath } from "@/backend/lib/config";
import path from 'path';
import fs from 'fs/promises';

export interface LogoutState {
  message: string;
  status: "success" | "error";
}

export async function logout(username?: string, role?: string): Promise<LogoutState> {
  const panelSettingsResult = await loadPanelSettings(); // For debug logging
  const debugMode = panelSettingsResult.data?.debugMode ?? false;

  if (debugMode) console.log(`[LogoutAction] Attempting logout for user: ${username}, role: ${role}`);

  if (!username || !role) {
    if (debugMode) console.warn("[LogoutAction] Username or role not provided. Cannot delete session file. Client should clear localStorage.");
    // Even if server can't delete file, client will clear localStorage and redirect.
    // No explicit redirect here as client will handle it after clearing its state.
    return { status: "success", message: "Local session cleared. Server state may persist if username/role missing." };
  }

  try {
    const safeUsername = username.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeRole = role.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionFilename = `${safeUsername}-${safeRole}-Auth.json`;
    const dataPath = getDataPath();
    const sessionFilePath = path.join(dataPath, sessionFilename);

    if (debugMode) console.log(`[LogoutAction] Attempting to delete session file: ${sessionFilePath}`);
    
    try {
      await fs.unlink(sessionFilePath);
      if (debugMode) console.log(`[LogoutAction] Session file ${sessionFilename} deleted successfully.`);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        if (debugMode) console.warn(`[LogoutAction] Session file ${sessionFilename} not found, presumed already deleted or never created.`);
      } else {
        console.error(`[LogoutAction] Error deleting session file ${sessionFilename}:`, e);
        // Don't fail the whole logout if file deletion fails, client will still clear its side.
      }
    }
    
    // Client is responsible for redirecting to /login after clearing localStorage.
    // The action itself doesn't need to redirect if called from client that handles UI.
    // However, if this were part of a server-side flow, a redirect might be needed.
    // For now, assume client handles redirect.
    return { status: "success", message: "Server session file processed for logout." };

  } catch (error) {
    console.error("[LogoutAction] Error during logout:", error);
    return { status: "error", message: "Logout failed on server." };
  }
}

// Helper, assuming loadPanelSettings is in settings/actions
import { loadPanelSettings } from '@/app/(app)/settings/actions';
