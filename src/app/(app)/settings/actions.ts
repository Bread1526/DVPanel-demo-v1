
'use server';

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import { logEvent } from '@/lib/logger';
import { 
  type PanelSettingsData, 
  type SavePanelSettingsState, 
  type LoadPanelSettingsState,
  panelSettingsSchema,
  explicitDefaultPanelSettings
} from './types';


const SETTINGS_FILENAME = ".settings.json";

async function getDebugModeFlag(): Promise<boolean> {
  // This is a simplified way to get debugMode for logging within these actions themselves.
  // It avoids circular dependencies if settings actions were to call loadPanelSettings recursively for its own debug flag.
  try {
    const loadedData = await loadEncryptedData(SETTINGS_FILENAME);
    if (loadedData && typeof (loadedData as any).debugMode === 'boolean') { // Cast to any to check for old debugMode
      return (loadedData as any).debugMode;
    }
    // Check if new schema might have it, though panelSettingsSchema no longer defines debugMode directly
    if (loadedData && panelSettingsSchema.safeParse(loadedData).success) {
        // This path is unlikely to find debugMode as it's user-specific now
    }
  } catch {
    // Ignore error, default to false
  }
  return false; // Default if not found or error
}


export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  submittedData: PanelSettingsData,
  currentUser?: { username: string; role: string }
): Promise<SavePanelSettingsState> {
  const debugModeForThisAction = await getDebugModeFlag(); // Or better, pass from client if available

  if (debugModeForThisAction) {
    console.log("[SavePanelSettingsAction] Received data object for validation:", JSON.stringify(submittedData, null, 2));
  }

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    if (debugModeForThisAction) {
      console.error("[SavePanelSettingsAction] Validation failed:", JSON.stringify(flatErrors, null, 2));
    }
    logEvent(currentUser?.username || 'System', currentUser?.role || 'Unknown', 'GLOBAL_SETTINGS_VALIDATION_FAILED', 'WARN', { errors: flatErrors.fieldErrors });
    return {
      message: "Validation failed. Please check your input.",
      status: "error",
      errors: flatErrors.fieldErrors as SavePanelSettingsState['errors'],
    };
  }

  const dataToSave: PanelSettingsData = validatedFields.data;

  try {
    await saveEncryptedData(SETTINGS_FILENAME, dataToSave);
    const dataPath = getDataPath(); 
    const fullPath = path.join(dataPath, SETTINGS_FILENAME);
    
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'Unknown';
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATED', 'INFO', { updatedFields: Object.keys(dataToSave) });
    
    const successMessageBase = 'Panel settings saved successfully';
    const successMessage = debugModeForThisAction 
                 ? `${successMessageBase} to ${fullPath}!` 
                 : `${successMessageBase}!`;

    if (debugModeForThisAction) {
      console.log(`[SavePanelSettingsAction] Settings successfully saved to ${fullPath}.`);
    }

    return {
      message: successMessage,
      status: "success",
      data: dataToSave,
    };
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    console.error("[SavePanelSettingsAction] Error saving panel settings:", e.message, e.stack);
    
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'Unknown';
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATE_FAILED', 'ERROR', { error: e.message });

    const clientErrorMessage = debugModeForThisAction ? `Failed to save settings: ${e.message}` : `Failed to save settings. An unexpected error occurred.`;
    return {
      message: clientErrorMessage,
      status: "error",
      errors: { general: [clientErrorMessage] },
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  const debugModeForLoading = await getDebugModeFlag(); 
  
  if (debugModeForLoading) {
    console.log("[LoadPanelSettingsAction] Attempting to load global settings from", SETTINGS_FILENAME);
  }

  try {
    const loadedData = await loadEncryptedData(SETTINGS_FILENAME);
    
    if (loadedData) {
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        const finalData = { ...explicitDefaultPanelSettings, ...parsedData.data }; // Ensure all defaults are applied if file is partial
        if (debugModeForLoading) {
          console.log("[LoadPanelSettingsAction] Successfully loaded and parsed global settings:", finalData);
        }
        return {
          status: "success",
          data: finalData,
        };
      } else {
        if (debugModeForLoading) {
          console.warn("[LoadPanelSettingsAction] Loaded global settings file has incorrect format or missing fields. Applying full defaults:", parsedData.error.flatten().fieldErrors);
        }
        logEvent('System', 'System', 'GLOBAL_SETTINGS_LOAD_INVALID_FORMAT', 'WARN', { errors: parsedData.error.flatten().fieldErrors });
        return {
          status: "success", 
          message: "Global settings file has an invalid format or missing fields. Full defaults applied.",
          data: { ...explicitDefaultPanelSettings },
        };
      }
    } else {
      if (debugModeForLoading) {
        console.log("[LoadPanelSettingsAction] No existing global settings file found (.settings.json). Applying full defaults.");
      }
      logEvent('System', 'System', 'GLOBAL_SETTINGS_FILE_NOT_FOUND', 'INFO');
      return {
        status: "not_found", 
        message: "No existing global settings file found. Defaults will be used.",
        data: { ...explicitDefaultPanelSettings }, 
      };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    if (debugModeForLoading) {
        console.error("[LoadPanelSettingsAction] Error loading global panel settings:", e.message, e.stack);
    }
    logEvent('System', 'System', 'GLOBAL_SETTINGS_LOAD_EXCEPTION', 'ERROR', { error: e.message });
    return {
      status: "error",
      message: `Failed to load global settings: ${e.message}. Defaults will be used.`,
      data: { ...explicitDefaultPanelSettings },
    };
  }
}
