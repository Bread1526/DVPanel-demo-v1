
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
  popup: popupSettingsSchema.default({
    notificationDuration: 5,
    disableAllNotifications: false,
    disableAutoClose: false,
    enableCopyError: false,
    showConsoleErrorsInNotifications: false,
  }),
  sessionInactivityTimeout: z.coerce.number().min(1).default(30).describe("Session inactivity timeout in minutes."),
  disableAutoLogoutOnInactivity: z.boolean().default(false).describe("Disable automatic logout due to inactivity."),
});

export type PanelSettingsData = z.infer<typeof panelSettingsSchema>;

export interface SavePanelSettingsState {
  message: string;
  status: "idle" | "success" | "error" | "validating";
  errors?: Partial<Record<keyof PanelSettingsData | "general" | "popup.notificationDuration" | "popup.disableAllNotifications" | "popup.disableAutoClose" | "popup.enableCopyError" | "popup.showConsoleErrorsInNotifications", string[]>>;
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
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};


export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  submittedData: PanelSettingsData
): Promise<SavePanelSettingsState> {
  
  const debugModeFromSubmission = submittedData.debugMode ?? false;
  if (debugModeFromSubmission) console.log("[SavePanelSettingsAction] Received data object for validation:", JSON.stringify(submittedData, null, 2));

  const validatedFields = panelSettingsSchema.safeParse(submittedData);

  if (!validatedFields.success) {
    const flatErrors = validatedFields.error.flatten();
    const errors: SavePanelSettingsState['errors'] = {};
    if (flatErrors.fieldErrors.panelPort) errors.panelPort = flatErrors.fieldErrors.panelPort;
    if (flatErrors.fieldErrors.panelIp) errors.panelIp = flatErrors.fieldErrors.panelIp;
    if (flatErrors.fieldErrors.debugMode) errors.debugMode = flatErrors.fieldErrors.debugMode;
    if (flatErrors.fieldErrors.sessionInactivityTimeout) errors.sessionInactivityTimeout = flatErrors.fieldErrors.sessionInactivityTimeout;
    if (flatErrors.fieldErrors.disableAutoLogoutOnInactivity) errors.disableAutoLogoutOnInactivity = flatErrors.fieldErrors.disableAutoLogoutOnInactivity;

    const popupErrors = flatErrors.fieldErrors.popup as any; // Zod types fieldErrors for objects as potentially undefined
    if (popupErrors) {
        if (popupErrors.notificationDuration) errors["popup.notificationDuration"] = popupErrors.notificationDuration;
        if (popupErrors.disableAllNotifications) errors["popup.disableAllNotifications"] = popupErrors.disableAllNotifications;
        if (popupErrors.disableAutoClose) errors["popup.disableAutoClose"] = popupErrors.disableAutoClose;
        if (popupErrors.enableCopyError) errors["popup.enableCopyError"] = popupErrors.enableCopyError;
        if (popupErrors.showConsoleErrorsInNotifications) errors["popup.showConsoleErrorsInNotifications"] = popupErrors.showConsoleErrorsInNotifications;
    }
    
    if (debugModeFromSubmission) console.error("[SavePanelSettingsAction] Validation failed:", JSON.stringify(flatErrors, null, 2));
    
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
    
    if (debugModeFromSubmission) console.log(`[SavePanelSettingsAction] Settings successfully saved to ${fullPath}.`);

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
      errors: { general: [`Storage Error: ${errorMessage}`] },
    };
  }
}

export async function loadPanelSettings(): Promise<LoadPanelSettingsState> {
  let debugModeForLoading = false; 
  try {
    const loadedData = await loadEncryptedData(SETTINGS_FILENAME);
    
    if (loadedData && typeof (loadedData as any).debugMode === 'boolean') {
        debugModeForLoading = (loadedData as any).debugMode;
    }

    if (debugModeForLoading) console.log("[LoadPanelSettingsAction] Attempting to load settings from", SETTINGS_FILENAME);

    if (loadedData) {
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        const mergedData = { 
          ...explicitDefaultPanelSettings, 
          ...parsedData.data, 
          popup: {...explicitDefaultPanelSettings.popup, ...(parsedData.data.popup || {})}
        };
        const finalData = panelSettingsSchema.parse(mergedData);
        
        if (debugModeForLoading) console.log("[LoadPanelSettingsAction] Successfully loaded and parsed settings:", finalData);
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
      if (debugModeForLoading) console.log("[LoadPanelSettingsAction] No existing settings file found. Applying full defaults.");
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
