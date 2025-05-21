
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
  currentUser?: { username: string; role: string }
): Promise<SavePanelSettingsState> {
  
  const currentSettingsForLogging = await loadPanelSettings(); // Load settings to get debugMode for this action's logging
  const debugModeForThisAction = currentSettingsForLogging.data?.debugMode ?? false;

  if (debugModeForThisAction) {
    console.log("[SavePanelSettingsAction] Received data for validation:", JSON.stringify(submittedData, null, 2));
  }

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    const errors: SavePanelSettingsState['errors'] = {};
    if (flatErrors.fieldErrors.panelPort) errors.panelPort = flatErrors.fieldErrors.panelPort;
    if (flatErrors.fieldErrors.panelIp) errors.panelIp = flatErrors.fieldErrors.panelIp;
    if (flatErrors.fieldErrors.sessionInactivityTimeout) errors.sessionInactivityTimeout = flatErrors.fieldErrors.sessionInactivityTimeout;
    if (flatErrors.fieldErrors.disableAutoLogoutOnInactivity) errors.disableAutoLogoutOnInactivity = flatErrors.fieldErrors.disableAutoLogoutOnInactivity;
    if (flatErrors.fieldErrors.debugMode) errors.debugMode = flatErrors.fieldErrors.debugMode;
    if (flatErrors.fieldErrors.daemonPort) errors.daemonPort = flatErrors.fieldErrors.daemonPort;
    if (flatErrors.fieldErrors.daemonIp) errors.daemonIp = flatErrors.fieldErrors.daemonIp;
    
    if (debugModeForThisAction) {
      console.error("[SavePanelSettingsAction] Validation failed:", JSON.stringify(flatErrors, null, 2));
    }
    
    const validationErrorMsg = "Validation failed. Please check your input.";
    logEvent(currentUser?.username || 'System', currentUser?.role || 'Unknown', 'GLOBAL_SETTINGS_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    return {
      message: validationErrorMsg,
      status: "error",
      errors: { ...errors, general: [validationErrorMsg] },
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
      try {
        await fs.stat(fullPath);
        console.log(`[SavePanelSettingsAction] VERIFIED: File ${SETTINGS_FILENAME} exists at ${fullPath} after save.`);
      } catch (statError) {
        console.error(`[SavePanelSettingsAction] VERIFICATION FAILED: File ${SETTINGS_FILENAME} DOES NOT exist at ${fullPath} after save attempt, or cannot be stat'd. Error:`, statError);
      }
      console.log(`[SavePanelSettingsAction] Call to saveEncryptedData for ${SETTINGS_FILENAME} completed.`);
    }
    
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'Unknown';
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATED', 'INFO', { updatedFields: Object.keys(dataToSave).filter(k => k in explicitDefaultPanelSettings && dataToSave[k as keyof PanelSettingsData] !== explicitDefaultPanelSettings[k as keyof PanelSettingsData]) });
    
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
    console.error("[SavePanelSettingsAction] Error saving panel settings to", fullPath, ":", e);
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'Unknown';
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATE_FAILED', 'ERROR', { error: e.message, path: fullPath });

    // Send detailed error message to client for debugging, as server logs are inaccessible
    const clientErrorMessage = `Failed to save settings. Server Error: ${e.message || String(e)}`;
    
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { general: [clientErrorMessage] },
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  const SETTINGS_FILENAME = ".settings.json";
  let debugModeForLoading = false; 
  
  try {
    const loadedData = await loadEncryptedData(SETTINGS_FILENAME);
    if (loadedData && typeof (loadedData as any).debugMode === 'boolean') {
        debugModeForLoading = (loadedData as PanelSettingsData).debugMode;
    }

    if (debugModeForLoading) {
      console.log("[LoadPanelSettingsAction] Attempting to load global settings from", SETTINGS_FILENAME);
    }

    if (loadedData) {
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
