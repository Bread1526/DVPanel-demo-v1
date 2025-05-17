
import { z } from "zod";

export const panelSettingsSchema = z.object({
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
});

export type PanelSettingsData = z.infer<typeof panelSettingsSchema>;

export const explicitDefaultPanelSettings: PanelSettingsData = panelSettingsSchema.parse({
  panelPort: "27407",
  panelIp: "",
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
});


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
