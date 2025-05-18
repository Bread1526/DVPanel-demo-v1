
import { z } from 'zod';
import type { UserSettingsData } from '@/lib/user-settings';

// --- Update Password ---
export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long.'),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'New passwords do not match.',
    path: ['confirmNewPassword'],
  });

export interface UpdatePasswordState {
  message: string;
  status: 'idle' | 'success' | 'error';
  errors?: Partial<
    Record<keyof z.infer<typeof updatePasswordSchema> | '_form', string[]>
  >;
}

// --- Update User-Specific Settings ---
export interface UpdateUserSettingsState {
  message: string;
  status: 'idle' | 'success' | 'error';
  errors?: Partial<Record<keyof UserSettingsData | '_form', string[]>>;
  data?: UserSettingsData;
}
