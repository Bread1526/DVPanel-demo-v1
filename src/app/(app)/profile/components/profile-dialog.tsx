
"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { useActionState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, Save, UserCircle, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AuthenticatedUser } from '@/lib/session';
import { updateUserPassword, type UpdatePasswordState } from '../actions';
import { Alert, AlertDescription, AlertTitle as ShadcnAlertTitle } from "@/components/ui/alert"; // Renamed AlertTitle
import { Separator } from '@/components/ui/separator';

interface ProfileDialogProps {
  currentUser: AuthenticatedUser | null;
  onPasswordUpdateSuccess?: () => void; // Optional: if AppShell needs to react to password change
}

const initialPasswordState: UpdatePasswordState = { message: "", status: "idle", errors: {} };

export default function ProfileDialog({ currentUser, onPasswordUpdateSuccess }: ProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordFormState, passwordFormAction, isPasswordActionPending] = useActionState(updateUserPassword, initialPasswordState);
  const [isPasswordTransitionPending, startPasswordTransition] = useTransition();

  useEffect(() => {
    if (open) {
      // Reset password fields when dialog opens
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      // Reset password form state as well if it's showing old errors
      if (passwordFormState.status !== 'idle') {
         // This is a bit tricky, ideally useActionState would have a reset.
         // For now, we rely on fields clearing.
      }
    }
  }, [open, passwordFormState.status]); // Added passwordFormState.status to dependencies

  useEffect(() => {
    if (!open && passwordFormState.status !== 'idle') {
      // If dialog closes and form had a non-idle state, consider resetting it
      // This is a more forceful reset, which might be desired if errors should clear on close
      // For now, let's keep it simple: fields clear on open.
    }
  }, [open, passwordFormState.status]);

  useEffect(() => {
    if (passwordFormState.status === "success") {
      toast({ title: "Success", description: passwordFormState.message });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      onPasswordUpdateSuccess?.(); // Call if provided
      // setOpen(false); // Optionally close dialog on success
    } else if (passwordFormState.status === "error" && passwordFormState.message && !passwordFormState.errors?._form) {
      // Field-specific errors are shown inline. This toast is for general errors from the action.
      toast({ title: "Password Change Error", description: passwordFormState.message, variant: "destructive" });
    }
     // If passwordFormState.errors?._form exists, it's displayed by the Alert component
  }, [passwordFormState, toast, onPasswordUpdateSuccess]);


  const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Password Mismatch", description: "New passwords do not match.", variant: "destructive" });
      return;
    }
    const formData = new FormData(event.currentTarget);
    startPasswordTransition(() => {
      passwordFormAction(formData);
    });
  };
  
  const isPasswordPending = isPasswordActionPending || isPasswordTransitionPending;

  if (!currentUser) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 px-2 text-sm h-auto py-1.5">
          <ProfileIcon className="mr-2 h-4 w-4" />Profile & Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md md:max-w-lg rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
          <DialogDescription>Manage your account password.</DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium text-muted-foreground">Username:</span> {currentUser.username || 'N/A'}</p>
              <p><span className="font-medium text-muted-foreground">Role:</span> {currentUser.role || 'N/A'}</p>
            </CardContent>
          </Card>

          <Separator />

          <form onSubmit={handlePasswordSubmit}>
            <Card>
              <CardHeader><CardTitle className="text-lg">Change Password</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {passwordFormState.status === "error" && passwordFormState.errors?._form && (
                    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><ShadcnAlertTitle>Error</ShadcnAlertTitle><AlertDescription>{passwordFormState.errors._form.join(', ')}</AlertDescription></Alert>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="currentPasswordProf" className="text-right col-span-1">Current</Label>
                  <Input id="currentPasswordProf" name="currentPassword" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="col-span-3" required />
                </div>
                {passwordFormState.errors?.currentPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.currentPassword.join(', ')}</p>}
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="newPasswordProf" className="text-right col-span-1">New</Label>
                  <Input id="newPasswordProf" name="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="col-span-3" required />
                </div>
                 {passwordFormState.errors?.newPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.newPassword.join(', ')}</p>}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="confirmNewPasswordProf" className="text-right col-span-1">Confirm</Label>
                  <Input id="confirmNewPasswordProf" name="confirmNewPassword" type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="col-span-3" required />
                </div>
                {passwordFormState.errors?.confirmNewPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.confirmNewPassword.join(', ')}</p>}
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isPasswordPending} className="ml-auto">
                  {isPasswordPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Update Password
                </Button>
              </CardFooter>
            </Card>
          </form>
          <p className="text-xs text-muted-foreground text-center pt-4">
            Popup and Debug preferences are now global settings managed under the main "Settings" area.
          </p>
        </div>
        <DialogFooter className="border-t pt-4">
          <DialogClose asChild>
            <Button variant="outline" onClick={() => setOpen(false)}>
               <X className="mr-2 h-4 w-4" /> Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
