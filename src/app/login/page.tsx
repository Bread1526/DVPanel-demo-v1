
"use client";

import React, { useEffect, useState, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { motion } from "framer-motion";
import { login } from './actions';
import type { LoginState } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const initialLoginState: LoginState = { message: "", status: "idle", errors: {} };

export default function LoginPage() {
  const [formState, formAction, isActionPending] = useActionState(login, initialLoginState);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [reasonMessage, setReasonMessage] = useState<string | null>(null);
  const [isTransitionPending, startTransition] = useTransition();

  const [clickCount, setClickCount] = useState(0);
  const [easterEggActive, setEasterEggActive] = useState(false);

  const handleBannerClick = () => {
    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);
    if (newClickCount === 3) {
      setEasterEggActive(true);
      setTimeout(() => {
        setEasterEggActive(false);
        setClickCount(0); 
      }, 1000); 
    }
  };

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason) {
      let message = "Please log in to continue.";
      if (reason === 'inactive') {
        message = "You have been logged out due to inactivity.";
      } else if (reason === 'unauthorized') {
        message = "You need to log in to access this page.";
      } else if (reason === 'settings_changed') {
        message = "Settings updated. Please log in again.";
      } else if (reason === 'session_error_api' || reason === 'session_error_catch' || reason === 'unauthorized_no_user_data') {
        message = "Your session has expired or is invalid. Please log in again.";
      } else if (reason === 'account_inactive') {
        message = "Your account is inactive. Please contact an administrator.";
      }
      setReasonMessage(message);
      
      const current = new URL(window.location.href);
      current.searchParams.delete('reason');
      router.replace(current.pathname + current.search, {scroll: false});
    }
  }, [searchParams, router]);

  useEffect(() => {
    // Client-side console log for debugging formState changes
     if (process.env.NODE_ENV === 'development') {
      console.log('Login formState changed:', formState);
     }

    if (formState.status === "error" || formState.status === "validation_failed") {
      let mainErrorMessage = formState.message;
      let hasFieldErrors = false;

      if (formState.errors) {
        if (formState.errors.username && formState.errors.username.length > 0) hasFieldErrors = true;
        if (formState.errors.password && formState.errors.password.length > 0) hasFieldErrors = true;
        if (formState.errors._form && formState.errors._form.length > 0) {
           mainErrorMessage = formState.errors._form.join('; ');
        }
      }
      
      if ((!hasFieldErrors && mainErrorMessage) || (formState.errors?._form && formState.errors._form.length > 0)) {
        toast({
          title: "Login Failed",
          description: mainErrorMessage || "Please check your credentials.",
          variant: "destructive",
        });
      }
    }
  }, [formState, toast]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const keepLoggedIn = formData.get("keepLoggedIn") === "on";
    const redirect = searchParams.get('redirect') || "/";

    const dataToSubmit = new FormData();
    dataToSubmit.append("username", username);
    dataToSubmit.append("password", password);
    if (keepLoggedIn) {
        dataToSubmit.append("keepLoggedIn", "on");
    }
    dataToSubmit.append("redirectUrl", redirect);

    startTransition(() => {
      formAction(dataToSubmit);
    });
  }, [formAction, startTransition, searchParams]);

  const isFormProcessing = isActionPending || isTransitionPending;

  return (
    <Card className="w-full max-w-md shadow-2xl rounded-xl bg-card/80 backdrop-blur-sm border-border/30">
      <CardHeader className="space-y-2 text-center pt-6 pb-4">
        <motion.div
          className="w-full max-w-[350px] rounded-lg flex flex-col items-center justify-center cursor-pointer group mx-auto" // Centered, no fixed height, no bg, no shadow, no padding
          whileHover={{
            // Removed box shadow hover from the container
          }}
          transition={{ duration: 0.2, ease: "circOut" }}
          onClick={handleBannerClick}
        >
          <h2 className="text-lg font-medium text-slate-300 group-hover:text-slate-200 transition-colors duration-200 mb-1">
            Welcome to
          </h2>
          <h1 
            className={cn(
              "text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary via-sky-400 to-cyan-300 tracking-tight select-none text-center transition-all duration-150 ease-out group-hover:scale-110 group-hover:tracking-normal group-hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]", // Enhanced hover
              easterEggActive && "animate-pulse !bg-gradient-to-r !from-purple-500 !via-pink-500 !to-accent"
            )}
          >
            DVPanel
          </h1>
        </motion.div>
        <CardDescription className="pt-2">Enter your credentials to access your dashboard.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {reasonMessage && (
            <Alert variant="default" className="bg-primary/10 border-primary/30 text-primary-foreground">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">Information</AlertTitle>
              <AlertDescription className="text-primary/90">{reasonMessage}</AlertDescription>
            </Alert>
          )}
          {formState.status !== "idle" && formState.errors?._form && formState.errors._form.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Login Error</AlertTitle>
              <AlertDescription>{formState.errors._form.join('; ')}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="Enter your username"
              required
              className="text-base md:text-sm bg-background/70 border-border/50 placeholder:text-muted-foreground/80"
              aria-describedby={formState.errors?.username ? "username-error" : undefined}
              aria-invalid={!!formState.errors?.username}
            />
            {formState.errors?.username && <p id="username-error" className="text-xs text-destructive pt-1">{formState.errors.username.join(', ')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              required
              className="text-base md:text-sm bg-background/70 border-border/50 placeholder:text-muted-foreground/80"
              aria-describedby={formState.errors?.password ? "password-error" : undefined}
              aria-invalid={!!formState.errors?.password}
            />
            {formState.errors?.password && <p id="password-error" className="text-xs text-destructive pt-1">{formState.errors.password.join(', ')}</p>}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="keepLoggedIn" name="keepLoggedIn" />
            <Label
              htmlFor="keepLoggedIn"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Keep me logged in
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col pb-6">
          <Button type="submit" className="w-full text-lg py-6 shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isFormProcessing}>
            {isFormProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Log In"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
