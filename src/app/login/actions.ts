
"use server";

import { z } from "zod";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword } from '@/app/roles/actions'; // Assuming verifyPassword exists

const LoginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

export interface LoginState {
  message: string;
  status: "idle" | "success" | "error";
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | "_form", string[]>>;
}

const initialLoginState: LoginState = { message: "", status: "idle" };

export async function login(prevState: LoginState, formData: z.infer<typeof LoginSchema>): Promise<LoginState> {
  const validatedFields = LoginSchema.safeParse(formData);

  if (!validatedFields.success) {
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { username, password } = validatedFields.data;

  try {
    const usersResult = await loadUsers();
    if (usersResult.status !== 'success' || !usersResult.users) {
      return { message: "Error loading user data.", status: "error" };
    }
    
    const allUsers = usersResult.users;
    // Also consider the owner account if it's managed outside users.json
    // For now, we assume owner is also in users.json or needs a separate check
    // if (username === 'root_owner' && password === process.env.OWNER_PASSWORD) { ... }

    const user = allUsers.find(u => u.username === username);

    if (!user) {
      return { message: "Invalid username or password.", status: "error" };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      return { message: "Invalid username or password.", status: "error" };
    }

    // Password is valid, create session
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();

    return { message: "Login successful!", status: "success" };

  } catch (error) {
    console.error("Login error:", error);
    return { message: "An unexpected error occurred during login.", status: "error" };
  }
}
