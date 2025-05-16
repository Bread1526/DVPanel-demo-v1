
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
    const ownerUsernameEnv = process.env.OWNER_USERNAME;
    const ownerPasswordEnv = process.env.OWNER_PASSWORD;

    if (ownerUsernameEnv && ownerPasswordEnv && username === ownerUsernameEnv && password === ownerPasswordEnv) {
      console.log("[LoginAction] Owner login successful for:", ownerUsernameEnv);
      session.user = {
        id: 'owner_root', // A fixed ID for the .env owner
        username: ownerUsernameEnv,
        role: 'Owner', // Special 'Owner' role
      };
      session.isLoggedIn = true;
      await session.save();
      
      const destination = redirectUrl || '/'; // Default to dashboard if no redirectUrl
      console.log(`[LoginAction] Owner login redirecting to: ${destination}`);
      redirect(destination); // This will throw a NEXT_REDIRECT error, which is normal
    } else if (!ownerUsernameEnv || !ownerPasswordEnv) {
      console.warn("[LoginAction] OWNER_USERNAME or OWNER_PASSWORD is not set in .env.local. The .env owner login path is disabled.");
      // Fall through to check users.json
    }

    // 2. If not .env owner, or .env owner not configured/matched, check users from users.json
    console.log("[LoginAction] Attempting login for regular user from users.json:", username);
    const usersResult = await loadUsers();

    if (usersResult.status !== 'success' || !usersResult.users) {
      console.error("[LoginAction] Error loading user data from users.json:", usersResult.error);
      return { message: "System error: Could not load user data. Please try again later or contact support.", status: "error" };
    }
    
    const user = usersResult.users.find(u => u.username === username);

    if (!user) {
      console.log("[LoginAction] User not found in users.json:", username);
      return { message: "Invalid username or password.", status: "error" };
    }
    
    if (user.status === 'Inactive') {
        console.log(`[LoginAction] User ${username} is inactive.`);
        return { message: "This account is inactive. Please contact an administrator.", status: "error" };
    }

    const isPasswordValid = await verifyPassword(password, user.hashedPassword, user.salt);
    if (!isPasswordValid) {
      console.log("[LoginAction] Invalid password for user from users.json:", username);
      return { message: "Invalid username or password.", status: "error" };
    }

    // Password is valid for regular user, create session
    console.log("[LoginAction] Regular user login successful for:", username);
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role, // Role from users.json
    };
    session.isLoggedIn = true;
    await session.save();
    
    const destination = redirectUrl || '/';
    console.log(`[LoginAction] Regular user login redirecting to: ${destination}`);
    redirect(destination); // This will throw a NEXT_REDIRECT error

  } catch (error: any) {
    // Check if the error is a Next.js redirect error
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw the redirect error
    }
    console.error("[LoginAction] Unexpected login error:", error);
    return { message: "An unexpected error occurred during login. Please try again.", status: "error" };
  }
}
