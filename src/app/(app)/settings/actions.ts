// src/app/(app)/settings/actions.ts
'use server';

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger';
import { type PanelSettingsData, panelSettingsSchema, explicitDefaultPanelSettings, type SavePanelSettingsState, type LoadPanelSettingsState } from './types';

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  submittedData: PanelSettingsData,
  currentUser?: { username: string; role: string } // This is optional now
): Promise<SavePanelSettingsState> {
  
  const debugModeForThisAction = submittedData.debugMode ?? false; // Use submitted debugMode for this action's logging

  if (debugModeForThisAction) {
    console.log("[SavePanelSettingsAction] Received data for validation:", JSON.stringify(submittedData, null, 2));
  }

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    const errors: SavePanelSettingsState['errors'] = {};
    // Map Zod errors to your state structure if needed
    if (flatErrors.fieldErrors.panelPort) errors.panelPort = flatErrors.fieldErrors.panelPort;
    if (flatErrors.fieldErrors.panelIp) errors.panelIp = flatErrors.fieldErrors.panelIp;
    if (flatErrors.fieldErrors.sessionInactivityTimeout) errors.sessionInactivityTimeout = flatErrors.fieldErrors.sessionInactivityTimeout;
    if (flatErrors.fieldErrors.disableAutoLogoutOnInactivity) errors.disableAutoLogoutOnInactivity = flatErrors.fieldErrors.disableAutoLogoutOnInactivity;
    if (flatErrors.fieldErrors.debugMode) errors.debugMode = flatErrors.fieldErrors.debugMode;
    if (flatErrors.fieldErrors.daemonPort) errors.daemonPort = flatErrors.fieldErrors.daemonPort;
    if (flatErrors.fieldErrors.daemonIp) errors.daemonIp = flatErrors.fieldErrors.daemonIp;
    // No more popup settings globally
    
    if (debugModeForThisAction) {
      console.error("[SavePanelSettingsAction] Validation failed:", JSON.stringify(flatErrors, null, 2));
    }
    
    const validationErrorMsg = "Validation failed. Please check your input.";
    logEvent(currentUser?.username || 'System', currentUser?.role || 'System', 'GLOBAL_SETTINGS_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    return {
      message: validationErrorMsg,
      status: "error",
      errors: { ...errors, _form: [validationErrorMsg] }, // Changed 'general' to '_form'
    };
  }

  const dataToSave: PanelSettingsData = validatedFields.data;
  const SETTINGS_FILENAME = ".settings.json";
  const dataPath = getDataPath(); 
  const fullPath = path.join(dataPath, SETTINGS_FILENAME);

  try {
    if (debugModeForThisAction) {
      console.log(`[SavePanelSettingsAction] Data to save to ${SETTINGS_FILENAME}:`, JSON.stringify(dataToSave, null, 2));
      console.log(`[SavePanelSettingsAction] Full path for saving: ${fullPath}`);
    }
    await saveEncryptedData(SETTINGS_FILENAME, dataToSave);
    if (debugModeForThisAction) {
        console.log(`[SavePanelSettingsAction] Successfully called saveEncryptedData for ${SETTINGS_FILENAME}. Verifying file existence...`);
        try {
            await fs.stat(fullPath);
            console.log(`[SavePanelSettingsAction] VERIFIED: File ${SETTINGS_FILENAME} exists at ${fullPath} after save.`);
        } catch (statError: any) {
            console.error(`[SavePanelSettingsAction] VERIFICATION FAILED: File ${SETTINGS_FILENAME} DOES NOT exist at ${fullPath} after save attempt, or cannot be stat'd. Error: ${statError.message}`);
        }
    }
    
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'System';
    // Log which fields were actually changed
    const changedFields = Object.keys(dataToSave).filter(key =>
      explicitDefaultPanelSettings.hasOwnProperty(key as keyof PanelSettingsData) &&
      dataToSave[key as keyof PanelSettingsData] !== explicitDefaultPanelSettings[key as keyof PanelSettingsData]
    );
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATED', 'INFO', { updatedFields: changedFields.length > 0 ? changedFields : "No changes detected" });
    
    const successMessageBase = 'Panel settings saved successfully';
    const successMessage = dataToSave.debugMode 
                 ? `${successMessageBase} to ${fullPath}!` 
                 : `${successMessageBase}!`;

    return {
      message: successMessage,
      status: "success",
      data: dataToSave,
    };
  } catch (e: any) {
    console.error("[SavePanelSettingsAction] CRITICAL: Error saving panel settings. Full error object caught:", e);
    console.error("[SavePanelSettingsAction] Error Name:", e.name);
    console.error("[SavePanelSettingsAction] Error Message:", e.message);
    console.error("[SavePanelSettingsAction] Error Stack:", e.stack);
    
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'System';
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATE_FAILED', 'ERROR', { error: e.message, path: fullPath });

    const clientErrorMessage = `Failed to save settings. Server Error: ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0,200)}...` : ''}`;
    
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { _form: [clientErrorMessage] }, // Changed 'general' to '_form'
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  const SETTINGS_FILENAME = ".settings.json";
  let debugModeForLoading = false; 
  
  try {
    // Preliminary load just to check for debugMode to enable more logging for the actual load
    try {
      const preLoadedData = await loadEncryptedData(SETTINGS_FILENAME) as PanelSettingsData | null;
      if (preLoadedData && typeof preLoadedData.debugMode === 'boolean') {
        debugModeForLoading = preLoadedData.debugMode;
      }
    } catch (preLoadError) {
      // Ignore if pre-load fails, debugModeForLoading remains false
    }

    if (debugModeForLoading) {
      console.log("[LoadPanelSettingsAction] Attempting to load global settings from", SETTINGS_FILENAME);
    }

    const loadedData = await loadEncryptedData(SETTINGS_FILENAME) as PanelSettingsData | null;

    if (loadedData) {
      if (debugModeForLoading) console.log("[LoadPanelSettingsAction] Raw loaded data:", loadedData);
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        const finalData = { 
          ...explicitDefaultPanelSettings, 
          ...parsedData.data, 
        };
        
        if (debugModeForLoading) {
          console.log("[LoadPanelSettingsAction] Successfully loaded and parsed global settings:", finalData);
        }
        return {
          status: "success",
          data: finalData,
        };
      } else {
        console.warn("[LoadPanelSettingsAction] Loaded global settings file has incorrect format or missing fields. Applying full defaults. Errors:", parsedData.error.flatten().fieldErrors);
        const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings); // Use explicit defaults
        
        // Attempt to save valid defaults back to fix a corrupted file
        try {
          await saveEncryptedData(SETTINGS_FILENAME, defaults);
          console.log("[LoadPanelSettingsAction] Corrupted settings file was overwritten with defaults.");
        } catch (saveError: any) {
          console.error("[LoadPanelSettingsAction] CRITICAL: Failed to save default settings after detecting corrupted file:", saveError);
        }

        return {
          status: "success", // Still success, but with a message about defaults
          message: "Global settings file was invalid. Defaults have been applied and saved.",
          data: defaults,
        };
      }
    } else {
      if (debugModeForLoading) {
        console.log("[LoadPanelSettingsAction] No existing global settings file found. Applying and saving full defaults.");
      }
      const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings);
      try {
        await saveEncryptedData(SETTINGS_FILENAME, defaults); // Create with defaults
        console.log("[LoadPanelSettingsAction] Created new settings file with defaults.");
      } catch (saveError: any) {
         console.error("[LoadPanelSettingsAction] CRITICAL: Failed to save new default settings file:", saveError);
      }
      return {
        status: "not_found", // Indicate that a new file was created with defaults
        message: "No existing global settings file found. Defaults have been applied and saved.",
        data: defaults, 
      };
    }
  } catch (error: any) {
    console.error("[LoadPanelSettingsAction] Error loading global panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings); // Fallback to defaults
    return {
      status: "error",
      message: `Failed to load global settings: ${errorMessage}. Defaults will be used.`,
      data: defaults,
    };
  }
}
