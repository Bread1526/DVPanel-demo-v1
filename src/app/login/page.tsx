
"use client";

import React, { useEffect } from 'react';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Replace, AlertCircle, Loader2 } from 'lucide-react'; 
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSearchParams, useRouter } from 'next/navigation'; // Added useSearchParams here

const initialLoginState: LoginState = { message: "", status: "idle" };

export default function LoginPage() {
  const [formState, formAction, isPending] = useActionState(login, initialLoginState);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectUrl = searchParams.get('redirect');

  useEffect(() => {
    if (formState.status === "success") {
      toast({ title: "Login Success", description: formState.message });
      // Redirection is now handled by the server action itself using `redirect()`.
      // If client-side redirect were needed as a fallback, it would be:
      // router.push(redirectUrl || '/'); 
    } else if (formState.status === "error" && formState.message) {
      toast({
        title: "Login Failed",
        description: formState.message || "An unknown error occurred.",
        variant: "destructive",
      });
    }
  }, [formState, toast, router, redirectUrl]);

  return (
    <Card className="w-full max-w-md shadow-2xl rounded-xl">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center items-center mb-4">
          <Replace size={48} className="text-primary" />
        </div>
        <CardTitle className="text-3xl font-bold">Welcome to DVPanel</CardTitle>
        <CardDescription>Enter your credentials to access your dashboard.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-6">
          {formState.status === 'error' && formState.errors?._form && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formState.errors._form.join(', ')}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input 
              id="username" 
              name="username" 
              type="text" 
              placeholder="m@example.com" 
              required 
              className="text-base md:text-sm"
            />
            {formState.errors?.username && <p className="text-xs text-destructive pt-1">{formState.errors.username.join(', ')}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              name="password" 
              type="password" 
              required 
              className="text-base md:text-sm"
            />
            {formState.errors?.password && <p className="text-xs text-destructive pt-1">{formState.errors.password.join(', ')}</p>}
          </div>
          {redirectUrl && <input type="hidden" name="redirectUrl" value={redirectUrl} />}
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button type="submit" className="w-full text-lg py-6 shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Log In"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

