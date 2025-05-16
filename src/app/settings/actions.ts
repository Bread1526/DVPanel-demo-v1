
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
    }, "Panel Port must be between 1 and 65535."),
  panelIp: z
    .string() // Will be an empty string if user leaves it blank
    .refine(
      (val) =>
        val === "" || // Allow empty string
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(val) || // IPv4
        /^[a-zA-Z0-9.-]+$/.test(val), // Domain name
      {
        message:
          "Must be a valid IPv4 address, domain name, or empty (interpreted as 0.0.0.0).",
      }
    ).default(""), // Default to empty string if not provided
  debugMode: z.boolean().optional().default(false),
  popup: popupSettingsSchema.default({ // Ensure popup has defaults if not in file
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
    general?: string;
  };
  data?: PanelSettingsData;
}

export interface LoadPanelSettingsState {
  message?: string;
  status: "success" | "error" | "not_found";
  data?: PanelSettingsData;
}

const SETTINGS_FILENAME = ".settings.json"; // Prepending dot for hidden file convention

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  formData: FormData
): Promise<SavePanelSettingsState> {
  const rawFormData = {
    panelPort: String(formData.get("panel-port") ?? ""),
    panelIp: String(formData.get("panel-ip") ?? ""),
    debugMode: formData.get("debug-mode") === "on",
    popup: {
      notificationDuration: parseInt(String(formData.get("popup-duration") ?? "5"), 10),
      disableAllNotifications: formData.get("popup-disable-all") === "on",
      disableAutoClose: formData.get("popup-disable-autoclose") === "on",
      enableCopyError: formData.get("popup-enable-copy") === "on",
      showConsoleErrorsInNotifications: formData.get("popup-show-console-errors") === "on",
    }
  };

  const validatedFields = panelSettingsSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
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
    console.error("Error saving panel settings:", error);
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
        return {
          status: "success",
          data: parsedData.data, // panelIp and popup will have their correct types from schema
        };
      } else {
        console.warn("Loaded settings file has incorrect format or missing fields. Applying full defaults:", parsedData.error.flatten().fieldErrors);
        // If parsing fails, fall back to complete defaults from the schema
        const defaults = panelSettingsSchema.parse({});
        return {
          status: "success", 
          message: "Settings file has an invalid format or missing fields. Full defaults applied.",
          data: defaults,
        };
      }
    } else {
      // If no file found, use complete defaults from the schema
      const defaults = panelSettingsSchema.parse({});
      return {
        status: "not_found",
        message: "No existing settings file found. Defaults will be used.",
        data: defaults, 
      };
    }
  } catch (error) {
    console.error("Error loading panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    // If any other error occurs during load, use complete defaults
    const defaults = panelSettingsSchema.parse({});
    return {
      status: "error",
      message: `Failed to load settings: ${errorMessage}. Defaults will be used.`,
      data: defaults,
    };
  }
}
