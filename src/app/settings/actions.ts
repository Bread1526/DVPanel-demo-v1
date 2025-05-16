
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
    .string()
    .optional()
    .transform(e => e === "" ? undefined : e)
    .refine(
      (val) =>
        val === undefined ||
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
          val
        ) ||
        /^[a-zA-Z0-9.-]+$/.test(val),
      {
        message:
          "Must be a valid IPv4 address, domain name, or empty (for 0.0.0.0).",
      }
    ),
  debugMode: z.boolean().optional().default(false),
  popup: popupSettingsSchema.default({
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

const SETTINGS_FILENAME = "settings.json";

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  formData: FormData
): Promise<SavePanelSettingsState> {
  const rawFormData = {
    panelPort: formData.get("panel-port") as string,
    panelIp: formData.get("panel-ip") as string,
    debugMode: formData.get("debug-mode") === "on",
    popup: {
      notificationDuration: parseInt(formData.get("popup-duration") as string || "5", 10),
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

  const dataToSave: PanelSettingsData = {
    ...validatedFields.data,
    panelIp: validatedFields.data.panelIp || "", 
  };

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
      // Ensure defaults are applied if parts of the data are missing
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        return {
          status: "success",
          data: {
            ...parsedData.data,
            panelIp: parsedData.data.panelIp || "",
          },
        };
      } else {
        console.warn("Loaded settings file has incorrect format or missing fields, applying defaults:", parsedData.error.flatten().fieldErrors);
        // Construct a default structure if parsing fails but some data might be salvageable or defaults are needed
        const defaultData: PanelSettingsData = {
          panelPort: (loadedData as any).panelPort || "27407",
          panelIp: (loadedData as any).panelIp || "",
          debugMode: (loadedData as any).debugMode === true,
          popup: { // Apply defaults for popup specifically
            notificationDuration: (loadedData as any).popup?.notificationDuration ?? 5,
            disableAllNotifications: (loadedData as any).popup?.disableAllNotifications ?? false,
            disableAutoClose: (loadedData as any).popup?.disableAutoClose ?? false,
            enableCopyError: (loadedData as any).popup?.enableCopyError ?? false,
            showConsoleErrorsInNotifications: (loadedData as any).popup?.showConsoleErrorsInNotifications ?? false,
          }
        };
        return {
          status: "success", 
          message: "Settings file has an invalid format or missing fields. Defaults applied for some settings.",
          data: defaultData,
        };
      }
    } else {
      // Return full default structure if no file found
      const defaults = panelSettingsSchema.parse({});
      return {
        status: "not_found",
        message: "No existing settings file found. Defaults will be used.",
        data: { ...defaults, panelIp: "" }, // ensure panelIp default is consistent
      };
    }
  } catch (error) {
    console.error("Error loading panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    const defaults = panelSettingsSchema.parse({});
    return {
      status: "error",
      message: `Failed to load settings: ${errorMessage}`,
      data: { ...defaults, panelIp: "" },
    };
  }
}
