
"use server";

import { z } from "zod";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword } from '@/app/roles/actions'; 

const LoginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
  redirectUrl: z.string().optional(), // For post-login redirection
});

export interface LoginState {
  message: string;
  status: "idle" | "success" | "error";
  errors?: Partial<Record<keyof z.infer<typeof LoginSchema> | "_form", string[]>>;
}

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const rawFormData = {
    username: formData.get("username") as string,
    password: formData.get("password") as string,
    redirectUrl: formData.get("redirectUrl") as string | undefined,
  };

  const validatedFields = LoginSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      message: "Validation failed.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { username, password, redirectUrl } = validatedFields.data;

  try {
    const session = await getIronSession<SessionData>(cookies(), sessionOptions);

    // 1. Check for .env Owner credentials
    const ownerUsername = process.env.OWNER_USERNAME;
    const ownerPassword = process.env.OWNER_PASSWORD;

    if (!ownerUsername || !ownerPassword) {
      console.warn("OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. Fallback owner login is disabled.");
    } else if (username === ownerUsername && password === ownerPassword) {
      console.log("Owner login successful");
      session.user = {
        id: 'owner_root', // Special ID for owner
        username: ownerUsername,
        role: 'Owner',
      };
      session.isLoggedIn = true;
      await session.save();
      
      const destination = redirectUrl || '/';
      redirect(destination); // This will throw a NEXT_REDIRECT error, caught by Next.js
      // return { message: "Login successful! Redirecting...", status: "success" }; // Won't be reached if redirect works
    }

    // 2. If not owner, check users from users.json
    const usersResult = await loadUsers();
    if (usersResult.status !== 'success' || !usersResult.users) {
      return { message: "Error loading user data. Owner login (if configured) might still work.", status: "error" };
    }
    
    const user = usersResult.users.find(u => u.username === username);

    if (!user) {
      return { message: "Invalid username or password.", status: "error" };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      return { message: "Invalid username or password.", status: "error" };
    }

    // Password is valid, create session for regular user
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();
    
    const destination = redirectUrl || '/';
    redirect(destination); // This will throw a NEXT_REDIRECT error
    // return { message: "Login successful! Redirecting...", status: "success" }; // Won't be reached

  } catch (error: any) {
    // If error is NEXT_REDIRECT, Next.js handles it. Re-throw to ensure it's handled.
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error("Login error:", error);
    return { message: "An unexpected error occurred during login.", status: "error" };
  }
}
