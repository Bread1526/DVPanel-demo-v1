
"use server";

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";
import { getDataPath } from "@/backend/lib/config";
import path from "path";

const popupSettingsSchema = z.object({
  notificationDuration: z.coerce.number().min(2).max(15).default(5),
  disableAllNotifications: z.boolean().default(false),
  disableAutoClose: z.boolean().default(false),
  enableCopyError: z.boolean().default(false),
  showConsoleErrorsInNotifications: z.boolean().default(false),
});

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
        val === "" || // Allow empty string
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(val) || // IPv4
        /^[a-zA-Z0-9.-]+$/.test(val), // Domain name
      {
        message:
          "Must be a valid IPv4 address, domain name, or empty (interpreted as 0.0.0.0).",
      }
    ).default(""),
  debugMode: z.boolean().optional().default(false),
  popup: popupSettingsSchema.default({ // Ensure popup itself has a default
    notificationDuration: 5,
    disableAllNotifications: false,
    disableAutoClose: false,
    enableCopyError: false,
    showConsoleErrorsInNotifications: false,
  }),
});

export type PanelSettingsData = z.infer<typeof panelSettingsSchema>;

export interface SavePanelSettingsState {
  message: string;
  status: "idle" | "success" | "error" | "validating";
  errors?: {
    panelPort?: string[];
    panelIp?: string[];
    debugMode?: string[];
    popup?: {
      notificationDuration?: string[];
      disableAllNotifications?: string[];
      disableAutoClose?: string[];
      enableCopyError?: string[];
      showConsoleErrorsInNotifications?: string[];
    };
    general?: string; // For top-level form errors
  };
  data?: PanelSettingsData;
}

export interface LoadPanelSettingsState {
  message?: string;
  status: "success" | "error" | "not_found";
  data?: PanelSettingsData;
}

const SETTINGS_FILENAME = ".settings.json"; // Hidden file convention

const explicitDefaultPanelSettings: PanelSettingsData = {
  panelPort: "27407",
  panelIp: "",
  debugMode: false,
  popup: {
    notificationDuration: 5,
    disableAllNotifications: false,
    disableAutoClose: false,
    enableCopyError: false,
    showConsoleErrorsInNotifications: false,
  },
};


export async function savePanelSettings(
  prevState: SavePanelSettingsState, // Not directly used if passing full object
  submittedData: PanelSettingsData 
): Promise<SavePanelSettingsState> {
  
  console.log("[SavePanelSettingsAction] Received data object for validation:", submittedData);

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    console.error("[SavePanelSettingsAction] Validation failed:", validatedFields.error.flatten().fieldErrors);
    return {
      message: "Validation failed. Please check your input.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors as SavePanelSettingsState['errors'],
    };
  }

  const dataToSave: PanelSettingsData = validatedFields.data;

  try {
    await saveEncryptedData(SETTINGS_FILENAME, dataToSave);
    const dataPath = getDataPath(); 
    const fullPath = path.join(dataPath, SETTINGS_FILENAME);
    
    return {
      message: dataToSave.debugMode 
                 ? `Panel settings saved successfully to ${fullPath}!` 
                 : 'Panel settings saved successfully!',
      status: "success",
      data: dataToSave,
    };
  } catch (error) {
    console.error("[SavePanelSettingsAction] Error saving panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while saving settings.";
    return {
      message: `Failed to save settings: ${errorMessage}`,
      status: "error",
      errors: { general: `Storage Error: ${errorMessage}` },
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  try {
    const loadedData = await loadEncryptedData(SETTINGS_FILENAME);
    if (loadedData) {
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        // Ensure all defaults are applied if some fields were missing from older files
        const mergedData = { ...explicitDefaultPanelSettings, ...parsedData.data, popup: {...explicitDefaultPanelSettings.popup, ...(parsedData.data.popup || {})}};
        const finalData = panelSettingsSchema.parse(mergedData); // Re-parse to ensure full validity with defaults
        
        return {
          status: "success",
          data: finalData,
        };
      } else {
        console.warn("[LoadPanelSettingsAction] Loaded settings file has incorrect format or missing fields. Applying full defaults:", parsedData.error.flatten().fieldErrors);
        const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings);
        return {
          status: "success", 
          message: "Settings file has an invalid format or missing fields. Full defaults applied.",
          data: defaults,
        };
      }
    } else {
      console.log("[LoadPanelSettingsAction] No existing settings file found. Applying full defaults.");
      const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings);
      return {
        status: "not_found", 
        message: "No existing settings file found. Defaults will be used.",
        data: defaults, 
      };
    }
  } catch (error) {
    console.error("[LoadPanelSettingsAction] Error loading panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    const defaults = panelSettingsSchema.parse(explicitDefaultPanelSettings);
    return {
      status: "error",
      message: `Failed to load settings: ${errorMessage}. Defaults will be used.`,
      data: defaults,
    };
  }
}
