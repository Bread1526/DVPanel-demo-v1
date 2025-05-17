
"use server";

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from "path";
import { logEvent } from '@/lib/logger'; // Import logger

// Panel settings schema WITHOUT popup and debugMode
const panelSettingsSchema = z.object({
  panelPort: z
    .string()
    .min(1, "Panel Port is required.")
    .regex(/^\d+$/, "Panel Port must be a number.")
    .refine((val) => {
      const portNum = parseInt(val, 10);
      return portNum >= 1 && portNum <= 65535;
    }, "Panel Port must be between 1 and 65535.")
    .default("27407"),
  panelIp: z
    .string()
    .refine(
      (val) =>
        val === "" ||
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(val) ||
        /^[a-zA-Z0-9.-]+$/.test(val),
      {
        message:
          "Must be a valid IPv4 address, domain name, or empty (interpreted as 0.0.0.0).",
      }
    ).default(""),
  sessionInactivityTimeout: z.coerce.number().min(1).default(30).describe("Session inactivity timeout in minutes."),
  disableAutoLogoutOnInactivity: z.boolean().default(false).describe("Disable automatic logout due to inactivity."),
  // debugMode and popup settings are removed from here
});

export type PanelSettingsData = z.infer<typeof panelSettingsSchema>;

export interface SavePanelSettingsState {
  message: string;
  status: "idle" | "success" | "error" | "validating";
  errors?: Partial<Record<keyof PanelSettingsData | "general", string[]>>;
  data?: PanelSettingsData;
  isPending?: boolean;
}

export interface LoadPanelSettingsState {
  message?: string;
  status: "success" | "error" | "not_found";
  data?: PanelSettingsData;
}

const SETTINGS_FILENAME = ".settings.json";

// Explicit defaults WITHOUT popup and debugMode
const explicitDefaultPanelSettings: PanelSettingsData = {
  panelPort: "27407",
  panelIp: "",
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  submittedData: PanelSettingsData,
  // Add current user for logging
  currentUser?: { username: string; role: string }
): Promise<SavePanelSettingsState> {
  // Load current settings to get debugMode for logging this action itself
  const currentSettingsForLogging = await loadPanelSettings();
  const debugModeForThisAction = currentSettingsForLogging.data?.debugMode ?? false; // User debugMode would be better

  if (debugModeForThisAction) {
    console.log("[SavePanelSettingsAction] Received data object for validation:", JSON.stringify(submittedData, null, 2));
  }

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    const errors: SavePanelSettingsState['errors'] = {};
    if (flatErrors.fieldErrors.panelPort) errors.panelPort = flatErrors.fieldErrors.panelPort;
    if (flatErrors.fieldErrors.panelIp) errors.panelIp = flatErrors.fieldErrors.panelIp;
    if (flatErrors.fieldErrors.sessionInactivityTimeout) errors.sessionInactivityTimeout = flatErrors.fieldErrors.sessionInactivityTimeout;
    if (flatErrors.fieldErrors.disableAutoLogoutOnInactivity) errors.disableAutoLogoutOnInactivity = flatErrors.fieldErrors.disableAutoLogoutOnInactivity;
    
    if (debugModeForThisAction) {
      console.error("[SavePanelSettingsAction] Validation failed:", JSON.stringify(flatErrors, null, 2));
    }
    
    return {
      message: "Validation failed. Please check your input.",
      status: "error",
      errors: errors,
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
    console.error("[SavePanelSettingsAction] Error saving panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while saving settings.";
    
    const logUsername = currentUser?.username || 'System';
    const logRole = currentUser?.role || 'Unknown';
    logEvent(logUsername, logRole, 'GLOBAL_SETTINGS_UPDATE_FAILED', 'ERROR', { error: errorMessage });

    return {
      message: `Failed to save settings: ${errorMessage}`,
      status: "error",
      errors: { general: [`Storage Error: ${errorMessage}`] },
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  // Try to load user-specific settings to get debugMode for logging this action
  // This creates a slight chicken-and-egg, so we'll default debugMode to false for this specific function's internal logging
  let debugModeForLoading = false; 
  
  try {
    const loadedData = await loadEncryptedData(SETTINGS_FILENAME);
    
    // User-specific debug mode isn't available when loading GLOBAL settings easily,
    // so we might have to rely on a general flag or keep logging minimal here.
    // For now, let's assume if .settings.json has a debugMode field (even if it's moving), use it.
    if (loadedData && typeof (loadedData as any).debugMode === 'boolean') {
        // This is a bit of a hack, as global settings no longer store debugMode.
        // This log line might need to be removed or made conditional on something else.
        // debugModeForLoading = (loadedData as any).debugMode; 
    }

    if (debugModeForLoading) {
      console.log("[LoadPanelSettingsAction] Attempting to load global settings from", SETTINGS_FILENAME);
    }

    if (loadedData) {
      // Validate against the schema that no longer includes popup/debug
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        // Merge with defaults to ensure all fields are present, even if old file had more
        const mergedData = { 
          ...explicitDefaultPanelSettings, 
          ...parsedData.data, 
        };
        const finalData = panelSettingsSchema.parse(mergedData); // Re-parse to apply defaults and coerce
        
        if (debugModeForLoading) {
          console.log("[LoadPanelSettingsAction] Successfully loaded and parsed global settings:", finalData);
        }
        return {
          status: "success",
          data: finalData,
        };
      } else {
        console.warn("[LoadPanelSettingsAction] Loaded global settings file has incorrect format or missing fields. Applying full defaults:", parsedData.error.flatten().fieldErrors);
        const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings); // Use explicit defaults
        return {
          status: "success", 
          message: "Global settings file has an invalid format or missing fields. Full defaults applied.",
          data: defaults,
        };
      }
    } else {
      if (debugModeForLoading) {
        console.log("[LoadPanelSettingsAction] No existing global settings file found. Applying full defaults.");
      }
      const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings); // Use explicit defaults
      return {
        status: "not_found", 
        message: "No existing global settings file found. Defaults will be used.",
        data: defaults, 
      };
    }
  } catch (error) {
    console.error("[LoadPanelSettingsAction] Error loading global panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings); // Use explicit defaults
    return {
      status: "error",
      message: `Failed to load global settings: ${errorMessage}. Defaults will be used.`,
      data: defaults,
    };
  }
}
