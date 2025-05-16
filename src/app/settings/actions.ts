"use server";

import { z } from 'zod';

const panelSettingsSchema = z.object({
  panelPort: z.coerce.number().min(1024).max(65535),
  panelIp: z.string().min(1, { message: "Panel IP/Domain cannot be empty" }), // Basic validation, can be improved for IP/domain format
});

export interface SavePanelSettingsState {
  message: string;
  status: "success" | "error" | "idle";
  errors?: {
    panelPort?: string[];
    panelIp?: string[];
  }
}

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  formData: FormData
): Promise<SavePanelSettingsState> {
  const validatedFields = panelSettingsSchema.safeParse({
    panelPort: formData.get('panel-port'),
    panelIp: formData.get('panel-ip'),
  });

  if (!validatedFields.success) {
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { panelPort, panelIp } = validatedFields.data;

  console.log("Attempting to save Panel Settings:");
  console.log("Panel Port:", panelPort);
  console.log("Panel IP/Domain:", panelIp);

  // In a real application, you would persist these settings here.
  // For example, to a database or a configuration management system.
  // For now, we are just logging them.
  // Note: Modifying runtime environment variables or Next.js server config
  // directly from an API like this is complex and generally not recommended
  // without a proper infrastructure setup (e.g., a system that can restart
  // the Next.js server with new env vars, or a reverse proxy that reads this config).

  // Simulate a save operation
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    message: `Panel settings (Port: ${panelPort}, IP: ${panelIp}) 'saved' (logged). Actual application of these settings requires infrastructure changes.`,
    status: "success",
  };
}
