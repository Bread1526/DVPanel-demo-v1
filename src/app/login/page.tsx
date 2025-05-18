
"use client";

import React, { useEffect, useState, useTransition } from 'react';
import { useActionState } from 'react';
// Removed: import Image from 'next/image'; 
import { login } from './actions';
import type { LoginState } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSearchParams, useRouter } from 'next/navigation';

const initialLoginState: LoginState = { message: "", status: "idle", errors: {} };

export default function LoginPage() {
  const [formState, formAction, isActionPending] = useActionState(login, initialLoginState);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [reasonMessage, setReasonMessage] = useState<string | null>(null);
  const [isTransitionPending, startTransition] = useTransition();

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason) {
        if (reason === 'inactive') {
            setReasonMessage("You have been logged out due to inactivity.");
        } else if (reason === 'unauthorized') {
            setReasonMessage("You need to log in to access this page.");
        } else if (reason === 'settings_changed') {
            setReasonMessage("Settings updated. Please log in again.");
        } else if (reason === 'session_error_api' || reason === 'session_error_catch' || reason === 'unauthorized_no_user_data') {
            setReasonMessage("Your session has expired or is invalid. Please log in again.");
        } else if (reason === 'account_inactive') {
            setReasonMessage("Your account is inactive. Please contact an administrator.");
        }
        
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('reason');
        router.replace(newUrl.toString(), { scroll: false });
    }
  }, [searchParams, router]);


  useEffect(() => {
    // Client-side console log for debugging formState changes
    // console.log('Login formState changed:', formState);

    if (formState.status === "success") {
      // Successful login is now handled by server-side redirect in the action
    } else if (formState.status === "error" || formState.status === "validation_failed") {
      const hasFieldErrors = (formState.errors?.username && formState.errors.username.length > 0) ||
                             (formState.errors?.password && formState.errors.password.length > 0);

      let mainErrorMessage = formState.message;
      if (formState.errors?._form && formState.errors._form.length > 0) {
        mainErrorMessage = formState.errors._form.join('; ');
      }

      if (!hasFieldErrors && mainErrorMessage) {
        toast({
          title: "Login Failed",
          description: mainErrorMessage,
          variant: "destructive",
        });
      }
    }
  }, [formState, toast, router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const keepLoggedIn = formData.get("keepLoggedIn") === "on";
    const redirectUrlParam = searchParams.get('redirect');

    // Construct the object to pass to the server action
    const submissionData = {
        username,
        password,
        redirectUrl: redirectUrlParam || '/', // Default redirect to dashboard
        keepLoggedIn,
    };
    
    startTransition(() => {
      formAction(submissionData);
    });
  };

  const isFormProcessing = isActionPending || isTransitionPending;

  return (
    <Card className="w-full max-w-md shadow-2xl rounded-xl">
      {/* Custom Banner Start */}
      <div className="pt-6 pb-2 flex justify-center">
        <div className="w-full max-w-[300px] h-[75px] rounded-lg bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-4 shadow-lg flex items-center justify-center border border-slate-600">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary via-sky-400 to-cyan-300 tracking-tighter">
            DVPanel
          </h1>
        </div>
      </div>
      {/* Custom Banner End */}
      <CardHeader className="space-y-1 text-center pt-4">
        <CardTitle className="text-3xl font-bold">Welcome to DVPanel</CardTitle>
        <CardDescription>Enter your credentials to access your dashboard.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {reasonMessage && (
            <Alert variant="default" className="bg-primary/10 border-primary/30">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertTitle>Information</AlertTitle>
              <AlertDescription>{reasonMessage}</AlertDescription>
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
              className="text-base md:text-sm"
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
              className="text-base md:text-sm"
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
          {searchParams.get('redirect') && <input type="hidden" name="redirectUrl" value={searchParams.get('redirect')!} />}
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button type="submit" className="w-full text-lg py-6 shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isFormProcessing}>
            {isFormProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Log In"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
