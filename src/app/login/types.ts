
import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required.'),
  password: z.string().min(1, 'Password is required.'),
  redirectUrl: z.string().optional(),
  keepLoggedIn: z.boolean().optional().default(false),
});

export interface LoginState {
  message: string;
  status: 'idle' | 'success' | 'error' | 'validation_failed';
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | '_form', string[]>>;
}
