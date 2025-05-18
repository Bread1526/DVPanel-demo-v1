
import { z } from 'zod';

// Schema for individual user data
export const userSchema = z.object({
  id: z.union([z.string().uuid(), z.literal('owner_root')]).describe("Unique user ID or 'owner_root' for the system owner."),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters long.')
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      'Username can only contain letters, numbers, dots, underscores, and hyphens.'
    ),
  hashedPassword: z.string(),
  salt: z.string(),
  role: z.enum(['Administrator', 'Admin', 'Custom', 'Owner']),
  projects: z
    .array(z.string().uuid().or(z.string().startsWith('project_')))
    .optional()
    .default([])
    .describe('Array of project IDs the user has access to.'),
  assignedPages: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Array of page/module IDs a Custom user can access.'),
  allowedSettingsPages: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Array of settings page IDs a user can access.'),
  lastLogin: z.string().datetime({ offset: true }).optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type UserData = z.infer<typeof userSchema>;

// Schema for adding a new user (password is plain text here, role excludes 'Owner')
export const addUserInputSchema = userSchema
  .omit({
    id: true,
    hashedPassword: true,
    salt: true,
    createdAt: true,
    updatedAt: true,
    lastLogin: true,
    role: true, // Omit to redefine with different enum
  })
  .extend({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long.'),
    role: z.enum(['Administrator', 'Admin', 'Custom']), // Owner cannot be created via UI
  });

// Schema for updating an existing user (password is optional, role excludes 'Owner')
export const updateUserInputSchema = userSchema
  .omit({
    hashedPassword: true,
    salt: true,
    createdAt: true,
    updatedAt: true,
    lastLogin: true,
    role: true, // Omit to redefine
  })
  .extend({
    password: z
      .string()
      .min(8, 'New password must be at least 8 characters.')
      .optional()
      .or(z.literal('')), // Allow empty string to signify no password change
    role: z.enum(['Administrator', 'Admin', 'Custom']), // Owner role cannot be changed via UI
  })
  .required({ id: true }); // ID is required for updates

export type AddUserInput = z.infer<typeof addUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type UserInput = AddUserInput | UpdateUserInput; // Union type for form handling

// State for loadUsers action
export interface LoadUsersState {
  users?: UserData[];
  error?: string;
  status: 'success' | 'error';
}

// State for addUser, updateUser, deleteUser actions
export interface UserActionState {
  message: string;
  status: 'success' | 'error' | 'idle';
  errors?: Partial<Record<keyof UserInput | '_form', string[]>>;
  user?: UserData; // Optionally return the affected user data
}
