
import { z } from "zod";

export const userPopupSettingsSchema = z.object({
  notificationDuration: z.coerce.number().min(2).max(15).default(5),
  disableAllNotifications: z.boolean().default(false),
  disableAutoClose: z.boolean().default(false),
  enableCopyError: z.boolean().default(true),
  showConsoleErrorsInNotifications: z.boolean().default(false),
});

export const userSettingsSchema = z.object({
  // debugMode is now global, removed from user-specific settings
  popup: userPopupSettingsSchema.default({
    notificationDuration: 5,
    disableAllNotifications: false,
    disableAutoClose: false,
    enableCopyError: true,
    showConsoleErrorsInNotifications: false,
  }),
});

export type UserSettingsData = z.infer<typeof userSettingsSchema>;
export type UserPopupSettingsData = z.infer<typeof userPopupSettingsSchema>;

// defaultUserSettings will be derived from the schema's defaults
export const defaultUserSettings: UserSettingsData = userSettingsSchema.parse({});
