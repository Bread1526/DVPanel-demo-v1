
"use server";

import { z } from "zod";
import { saveEncryptedData, loadEncryptedData } from "@/backend/services/storageService"; // Updated import path

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
});

export interface PanelSettingsData {
  panelPort: string;
  panelIp: string; // Stored as empty string if user leaves it blank
}

export interface SavePanelSettingsState {
  message: string;
  status: "idle" | "success" | "error" | "validating";
  errors?: {
    panelPort?: string[];
    panelIp?: string[];
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
  };

  try {
    await saveEncryptedData(SETTINGS_FILENAME, dataToSave);
    return {
      message: "Panel settings saved successfully to local file!",
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
      if (typeof (loadedData as any).panelPort === 'string' && 
          (typeof (loadedData as any).panelIp === 'string' || (loadedData as any).panelIp === undefined || (loadedData as any).panelIp === null)) {
        return {
          status: "success",
          data: {
            panelPort: (loadedData as PanelSettingsData).panelPort,
            panelIp: (loadedData as PanelSettingsData).panelIp || "", // Ensure empty string if undefined/null
          },
        };
      } else {
        console.warn("Loaded settings file has incorrect format:", loadedData);
        return {
          status: "error",
          message: "Settings file has an invalid format. Please save valid settings.",
        };
      }
    } else {
      return {
        status: "not_found",
        message: "No existing settings file found. Defaults will be used.",
      };
    }
  } catch (error) {
    console.error("Error loading panel settings:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading settings.";
    return {
      status: "error",
      message: `Failed to load settings: ${errorMessage}`,
    };
  }
}
