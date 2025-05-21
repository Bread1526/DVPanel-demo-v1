
"use server";

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import fs from 'fs/promises';
import { logEvent } from '@/lib/logger';
import { type PanelSettingsData, panelSettingsSchema, explicitDefaultPanelSettings, type SavePanelSettingsState, type LoadPanelSettingsState } from './types';
// currentUser prop is removed as global settings are not user-specific for modification rights here.
// Auth would be handled by middleware for the /settings routes.

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  submittedData: PanelSettingsData
): Promise<SavePanelSettingsState> {
  
  const debugModeForThisAction = submittedData.debugMode ?? explicitDefaultPanelSettings.debugMode;

  if (debugModeForThisAction) {
    console.log("[SavePanelSettingsAction] Received data for validation:", JSON.stringify(submittedData, null, 2));
  }

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    const validationErrorMsg = "Validation failed. Please check your input.";
    if (debugModeForThisAction) {
      console.error("[SavePanelSettingsAction] Validation failed:", JSON.stringify(flatErrors, null, 2));
    }
    logEvent('System', 'System', 'GLOBAL_SETTINGS_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    return {
      message: validationErrorMsg,
      status: "error",
      errors: { ...flatErrors.fieldErrors, _form: [validationErrorMsg] } as SavePanelSettingsState['errors'],
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
    
    let verified = false;
    if (debugModeForThisAction) {
        console.log(`[SavePanelSettingsAction] Successfully called saveEncryptedData for ${SETTINGS_FILENAME}. Verifying file existence...`);
        try {
            await fs.stat(fullPath);
            console.log(`[SavePanelSettingsAction] VERIFIED: File ${SETTINGS_FILENAME} exists at ${fullPath} after save.`);
            verified = true;
        } catch (statError: any) {
            console.error(`[SavePanelSettingsAction] VERIFICATION FAILED: File ${SETTINGS_FILENAME} DOES NOT exist at ${fullPath} after save attempt, or cannot be stat'd. Error:`, statError.message);
        }
    }
    
    logEvent('System', 'System', 'GLOBAL_SETTINGS_UPDATED', 'INFO', { updatedFields: Object.keys(dataToSave) });
    
    const successMessageBase = 'Panel settings saved successfully';
    const successMessage = dataToSave.debugMode && verified
                 ? `${successMessageBase} to ${fullPath}!` 
                 : `${successMessageBase}!`;

    return {
      message: successMessage,
      status: "success",
      data: dataToSave,
    };
  } catch (e: any) {
    console.error("[SavePanelSettingsAction] CRITICAL: Error saving panel settings:", e);
    let clientErrorMessage = "Failed to save settings due to a server error.";
    // Unconditionally provide more error detail to client for now, given no server log access for user
    clientErrorMessage = `Failed to save settings. Server Error: ${e.name ? `${e.name}: ` : ''}${e.message || String(e)}${e.stack ? ` Stack (partial): ${String(e.stack).substring(0,200)}...` : ''}`;
    
    logEvent('System', 'System', 'GLOBAL_SETTINGS_UPDATE_FAILED', 'ERROR', { error: e.message, path: fullPath });
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { _form: [clientErrorMessage] },
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  const SETTINGS_FILENAME = ".settings.json";
  let debugModeForLoading = false; 
  
  try {
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
      if (debugModeForLoading) console.log("[LoadPanelSettingsAction] Raw loaded data from file:", JSON.stringify(loadedData).substring(0, 300) + "...");
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        // Ensure all defaults are present by merging with explicit defaults
        const finalData = { 
          ...explicitDefaultPanelSettings, 
          ...parsedData.data,
          popup: { // Deep merge popup settings
            ...explicitDefaultPanelSettings.popup,
            ...(parsedData.data.popup || {}),
          }
        };
        
        if (debugModeForLoading) {
          console.log("[LoadPanelSettingsAction] Successfully loaded and merged global settings:", JSON.stringify(finalData).substring(0,300) + "...");
        }
        return {
          status: "success",
          data: finalData,
        };
      } else {
        console.warn("[LoadPanelSettingsAction] Loaded global settings file has incorrect format or missing fields. Applying full defaults. Errors:", parsedData.error.flatten().fieldErrors);
        const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings);
        
        try {
          await saveEncryptedData(SETTINGS_FILENAME, defaults);
          console.log("[LoadPanelSettingsAction] Corrupted settings file was overwritten with defaults.");
        } catch (saveError: any) {
          console.error("[LoadPanelSettingsAction] CRITICAL: Failed to save default settings after detecting corrupted file:", saveError);
        }

        return {
          status: "success",
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
        await saveEncryptedData(SETTINGS_FILENAME, defaults);
        console.log("[LoadPanelSettingsAction] Created new settings file with defaults.");
      } catch (saveError: any) {
         console.error("[LoadPanelSettingsAction] CRITICAL: Failed to save new default settings file:", saveError);
      }
      return {
        status: "not_found",
        message: "No existing global settings file found. Defaults have been applied and saved.",
        data: defaults, 
      };
    }
  } catch (error: any) {
    console.error("[LoadPanelSettingsAction] Error loading global panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings);
    return {
      status: "error",
      message: `Failed to load global settings: ${errorMessage}. Defaults will be used.`,
      data: defaults,
    };
  }
}
