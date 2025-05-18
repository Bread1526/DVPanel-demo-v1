
import { z } from 'zod';

// Zod schema for popup settings (now user-specific, but defaults defined here for reference if needed elsewhere)
export const userPopupSettingsSchema = z.object({
  notificationDuration: z.coerce.number().min(2).max(15).default(5),
  disableAllNotifications: z.boolean().default(false),
  disableAutoClose: z.boolean().default(false),
  enableCopyError: z.boolean().default(true), // Defaulted to true as per typical user expectation
  showConsoleErrorsInNotifications: z.boolean().default(false),
});

// Main panel settings schema (global settings)
export const panelSettingsSchema = z.object({
  panelPort: z
    .string()
    .min(1, 'Panel Port is required.')
    .regex(/^\d+$/, 'Panel Port must be a number.')
    .refine(
      (val) => {
        const portNum = parseInt(val, 10);
        return portNum >= 1 && portNum <= 65535;
      },
      { message: 'Panel Port must be between 1 and 65535.' }
    )
    .default('27407'),
  panelIp: z
    .string()
    .refine(
      (val) =>
        val === '' || // Allow empty string
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
          val
        ) || // IPv4
        /^[a-zA-Z0-9.-]+$/.test(val), // Domain name
      {
        message:
          'Must be a valid IPv4 address, domain name, or empty (interpreted as 0.0.0.0).',
      }
    )
    .default(''), // Default to empty string, meaning 0.0.0.0
  sessionInactivityTimeout: z.coerce
    .number()
    .min(1, 'Session timeout must be at least 1 minute.')
    .default(30)
    .describe('Session inactivity timeout in minutes.'),
  disableAutoLogoutOnInactivity: z
    .boolean()
    .default(false)
    .describe('Disable automatic logout due to inactivity.'),
  debugMode: z.boolean().default(false).describe('Global debug mode for the panel.'),
});

export type PanelSettingsData = z.infer<typeof panelSettingsSchema>;

// Explicit default values for PanelSettingsData
export const explicitDefaultPanelSettings: PanelSettingsData =
  panelSettingsSchema.parse({});

export interface SavePanelSettingsState {
  message: string;
  status: 'idle' | 'success' | 'error' | 'validating';
  errors?: Partial<Record<keyof PanelSettingsData | 'general', string[]>>;
  data?: PanelSettingsData;
  isPending?: boolean;
}

export interface LoadPanelSettingsState {
  message?: string;
  status: 'success' | 'error' | 'not_found';
  data?: PanelSettingsData;
}
