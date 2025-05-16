
"use server";

import { z } from "zod";
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionOptions, type SessionData } from '@/lib/session';
import { loadUsers, verifyPassword } from '@/app/(app)/roles/actions'; 

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
      console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. Fallback owner login is disabled.");
    } else if (username === ownerUsername && password === ownerPassword) {
      console.log("[LoginAction] Owner login successful for:", ownerUsername);
      session.user = {
        id: 'owner_root', 
        username: ownerUsername,
        role: 'Owner',
      };
      session.isLoggedIn = true;
      await session.save();
      
      const destination = redirectUrl || '/';
      console.log(`[LoginAction] Owner login redirecting to: ${destination}`);
      redirect(destination); 
    }

    // 2. If not owner, check users from users.json
    console.log("[LoginAction] Attempting login for regular user:", username);
    const usersResult = await loadUsers();
    if (usersResult.status !== 'success' || !usersResult.users) {
      console.error("[LoginAction] Error loading user data from users.json:", usersResult.error);
      return { message: "Error loading user data. Owner login (if configured) might still work.", status: "error" };
    }
    
    const user = usersResult.users.find(u => u.username === username);

    if (!user) {
      console.log("[LoginAction] User not found:", username);
      return { message: "Invalid username or password.", status: "error" };
    }
    
    if (user.status === 'Inactive') {
        console.log(`[LoginAction] User ${username} is inactive.`);
        return { message: "This account is inactive. Please contact an administrator.", status: "error" };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      console.log("[LoginAction] Invalid password for user:", username);
      return { message: "Invalid username or password.", status: "error" };
    }

    // Password is valid, create session for regular user
    console.log("[LoginAction] Regular user login successful for:", username);
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    session.isLoggedIn = true;
    await session.save();
    
    const destination = redirectUrl || '/';
    console.log(`[LoginAction] Regular user login redirecting to: ${destination}`);
    redirect(destination); 

  } catch (error: any) {
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error("[LoginAction] Login error:", error);
    return { message: "An unexpected error occurred during login.", status: "error" };
  }
}
