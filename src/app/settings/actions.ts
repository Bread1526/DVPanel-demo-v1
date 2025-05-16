
"use server";

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService";

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
    .transform(e => e === "" ? undefined : e) // Transform empty string to undefined for optional validation
    .refine(
      (val) =>
        val === undefined || // Allow undefined (empty input)
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
          val
        ) ||
        /^[a-zA-Z0-9.-]+$/.test(val), // Basic domain check
      {
        message:
          "Must be a valid IPv4 address, domain name, or empty (for 0.0.0.0).",
      }
    ),
  debugMode: z.boolean().optional().default(false),
});

export interface PanelSettingsData {
  panelPort: string;
  panelIp: string; // Stored as empty string if user leaves it blank
  debugMode: boolean;
}

export interface SavePanelSettingsState {
  message: string;
  status: "idle" | "success" | "error" | "validating";
  errors?: {
    panelPort?: string[];
    panelIp?: string[];
    debugMode?: string[];
    general?: string;
  };
  data?: PanelSettingsData;
}

export interface LoadPanelSettingsState {
  message?: string;
  status: "success" | "error" | "not_found";
  data?: PanelSettingsData;
}

const SETTINGS_FILENAME = ".settings.json"; // Changed to start with a dot for convention

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  formData: FormData
): Promise<SavePanelSettingsState> {
  const rawFormData = {
    panelPort: formData.get("panel-port") as string,
    panelIp: formData.get("panel-ip") as string,
    debugMode: formData.get("debug-mode") === "on", // Switch value is 'on' or null
  };

  const validatedFields = panelSettingsSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      message: "Validation failed. Please check your input.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const dataToSave: PanelSettingsData = {
    panelPort: validatedFields.data.panelPort,
    panelIp: validatedFields.data.panelIp || "", // Ensure empty string if undefined
    debugMode: validatedFields.data.debugMode,
  };

  try {
    await saveEncryptedData(SETTINGS_FILENAME, dataToSave);
    return {
      message: `Panel settings saved successfully${dataToSave.debugMode ? ` to ${SETTINGS_FILENAME}` : ''}!`,
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
      // Basic validation of loaded data structure
      const parsedData = panelSettingsSchema.safeParse(loadedData);
      if (parsedData.success) {
        return {
          status: "success",
          data: {
            panelPort: parsedData.data.panelPort,
            panelIp: parsedData.data.panelIp || "",
            debugMode: parsedData.data.debugMode,
          },
        };
      } else {
         console.warn("Loaded settings file has incorrect format or missing fields, applying defaults:", parsedData.error.flatten().fieldErrors);
        // Attempt to load with defaults for missing fields
        return {
          status: "success", // Still success, but inform user or use defaults
          message: "Settings file has an invalid format or missing fields. Defaults applied for some settings.",
          data: {
            panelPort: (loadedData as any).panelPort || "27407",
            panelIp: (loadedData as any).panelIp || "",
            debugMode: (loadedData as any).debugMode === true, // Ensure boolean
          },
        };
      }
    } else {
      return {
        status: "not_found",
        message: "No existing settings file found. Defaults will be used.",
        // Provide default data structure for a new setup
        data: { panelPort: "27407", panelIp: "", debugMode: false },
      };
    }
  } catch (error) {
    console.error("Error loading panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    return {
      status: "error",
      message: `Failed to load settings: ${errorMessage}`,
       data: { panelPort: "27407", panelIp: "", debugMode: false }, // Provide defaults on error too
    };
  }
}
