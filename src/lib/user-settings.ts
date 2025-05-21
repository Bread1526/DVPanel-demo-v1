
import { z } from "zod";

// This file defined user-specific settings, which are now moved to global panel settings.
// It might be removed or repurposed if no other user-specific, non-profile settings are planned.

// For now, we keep UserSettingsData minimal or empty if all settings are global.
// If you plan other user-specific settings (e.g., theme preference override, UI density),
// they would go here.

// Example: If user-specific settings were only debug and popup (which they are not anymore)
// this file would look like this:
// export const userSettingsSchema = z.object({}); // Empty object if no user-specific settings remain
// export type UserSettingsData = z.infer<typeof userSettingsSchema>;
// export const defaultUserSettings: UserSettingsData = {};

// Keeping it minimal for now. If all settings are global, this might not be needed by /api/auth/user
// unless for future expansion. For this refactor, we'll assume no other user-specific settings for now.
export const userSettingsSchema = z.object({
  // Add any truly user-specific (non-debug, non-popup) preferences here in the future
  // e.g., lastVisitedProjects: z.array(z.string()).optional(),
});

export type UserSettingsData = z.infer<typeof userSettingsSchema>;

// defaultUserSettings will be derived from the schema's defaults
export const defaultUserSettings: UserSettingsData = userSettingsSchema.parse({});

// UserPopupSettingsData is now PanelPopupSettingsData in settings/types.ts
// export type UserPopupSettingsData = z.infer<typeof userPopupSettingsSchema>;
