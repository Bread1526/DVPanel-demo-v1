
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
import { Loader2, Save, AlertCircle, X, UserCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AuthenticatedUser } from '@/lib/session';
import { updateUserPassword, type UpdatePasswordState } from '../actions';
import { Alert, AlertDescription, AlertTitle as ShadcnAlertTitle } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';
import { type UserSettingsData, defaultUserSettings, userSettingsSchema } from '@/lib/user-settings';
import { updateCurrentUserSpecificSettings, type UpdateUserSettingsState } from '../actions';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProfileDialogProps {
  currentUser: AuthenticatedUser | null;
  onSettingsUpdate?: () => void; // Callback to AppShell to refetch user data
}

const initialPasswordState: UpdatePasswordState = { message: "", status: "idle", errors: {} };
const initialSettingsState: UpdateUserSettingsState = { message: "", status: "idle", errors: {}, data: undefined };

// Helper to safely derive initial settings
const getInitialUserSettings = (currentUser: AuthenticatedUser | null): UserSettingsData => {
  if (currentUser?.userSettings) {
    return {
      ...defaultUserSettings,
      ...currentUser.userSettings,
      popup: {
        ...defaultUserSettings.popup,
        ...(currentUser.userSettings.popup || {}),
      },
    };
  }
  return defaultUserSettings;
};

export default function ProfileDialog({ currentUser, onSettingsUpdate }: ProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordFormState, passwordFormAction, isPasswordActionPending] = useActionState(updateUserPassword, initialPasswordState);

  // User-Specific Settings State
  const [userSettings, setUserSettings] = useState<UserSettingsData>(() => getInitialUserSettings(currentUser));
  const [settingsFormState, settingsFormAction, isSettingsActionPending] = useActionState(updateCurrentUserSpecificSettings, initialSettingsState);
  
  const [isPasswordTransitionPending, startPasswordTransition] = useTransition();
  const [isSettingsTransitionPending, startSettingsTransition] = useTransition();

  useEffect(() => {
    if (open) {
      // Reset password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      
      // Initialize user-specific settings from current user
      setUserSettings(getInitialUserSettings(currentUser));
      
      // Reset form states
      if (passwordFormState.status !== 'idle') {
        passwordFormAction(new FormData()); // Effectively resets to initialPasswordState if action allows resetting
      }
      if (settingsFormState.status !== 'idle' && settingsFormState.data !== undefined) {
         // No direct reset for settingsFormAction like password, manual reset of visual cues if needed
      }

    }
  }, [open, currentUser, passwordFormState.status, settingsFormState.status, settingsFormState.data, passwordFormAction]);


  useEffect(() => {
    // This effect syncs userSettings state if currentUser prop changes while dialog is open
    // or when it initially opens.
    if (currentUser) {
      setUserSettings(getInitialUserSettings(currentUser));
    }
  }, [currentUser]);


  useEffect(() => {
    if (passwordFormState.status === "success") {
      toast({ title: "Success", description: passwordFormState.message });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } else if (passwordFormState.status === "error" && passwordFormState.message && !passwordFormState.errors?._form) {
      toast({ title: "Password Change Error", description: passwordFormState.message, variant: "destructive" });
    }
  }, [passwordFormState, toast]);

  useEffect(() => {
    const toastDuration = (userSettings?.popup?.notificationDuration ?? defaultUserSettings.popup.notificationDuration) * 1000;
    
    if (settingsFormState.status === "success" && settingsFormState.message) {
      if (settingsFormState.data) {
        setUserSettings(prev => ({ // Merge with previous to keep other non-form settings if any
            ...prev, 
            ...settingsFormState.data,
            popup: {
                ...prev.popup,
                ...(settingsFormState.data?.popup || {})
            } 
        })); 
      }
      toast({ title: "Preferences Updated", description: settingsFormState.message, duration: toastDuration });
      onSettingsUpdate?.(); // Notify AppShell to refetch user data which includes these settings
    } else if (settingsFormState.status === "error" && settingsFormState.message) {
      let description = settingsFormState.message;
       if (settingsFormState.errors?.general?.length) {
          description = settingsFormState.errors.general.join('; ');
      } else if (settingsFormState.errors?.popup) {
        description = "Error in popup settings. " + settingsFormState.message;
      } else if (settingsFormState.errors?.debugMode) {
         description = (settingsFormState.errors.debugMode as string[]).join('; ');
      }
      toast({ title: "Error Saving Preferences", description: description, variant: "destructive", duration: toastDuration });
    }
  }, [settingsFormState, toast, onSettingsUpdate, userSettings?.popup?.notificationDuration]);


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
  
  const handleSettingsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validatedSettings = userSettingsSchema.safeParse(userSettings);
    if (!validatedSettings.success) {
        console.error("[ProfileDialog] Client-side validation failed for user settings:", validatedSettings.error.flatten().fieldErrors);
        toast({ title: "Validation Error", description: "Please check your settings inputs.", variant: "destructive"});
        return;
    }
    startSettingsTransition(() => {
      settingsFormAction(validatedSettings.data);
    });
  };

  const handlePopupSettingChange = <K extends keyof UserSettingsData['popup']>(
    key: K,
    value: UserSettingsData['popup'][K]
  ) => {
    setUserSettings(prev => ({
      ...prev,
      popup: {
        ...(prev.popup ?? defaultUserSettings.popup), // Ensure popup object exists
        [key]: value,
      }
    }));
  };
  
  const isAnyActionPending = isPasswordActionPending || isSettingsActionPending || isPasswordTransitionPending || isSettingsTransitionPending;
  
  // Create a safe version of userSettings for rendering, falling back to defaults if properties are missing
  // This is crucial to prevent runtime errors if userSettings or userSettings.popup is momentarily null/undefined
  const safeUserSettings: UserSettingsData = {
    ...defaultUserSettings,
    ...userSettings,
    popup: {
      ...defaultUserSettings.popup,
      ...(userSettings?.popup || {}),
    },
  };


  if (!currentUser) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 px-2 text-sm h-auto py-1.5">
          <UserCircle className="mr-2 h-4 w-4" />Profile & Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md md:max-w-lg rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
          <DialogDescription>Manage your account password and personal preferences.</DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[70vh] pr-3">
          <div className="py-4 space-y-6">
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
                    <Label htmlFor="currentPasswordProfDialog" className="text-right col-span-1">Current</Label>
                    <Input id="currentPasswordProfDialog" name="currentPassword" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="col-span-3" required />
                  </div>
                  {passwordFormState.errors?.currentPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.currentPassword.join(', ')}</p>}
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newPasswordProfDialog" className="text-right col-span-1">New</Label>
                    <Input id="newPasswordProfDialog" name="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="col-span-3" required />
                  </div>
                  {passwordFormState.errors?.newPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.newPassword.join(', ')}</p>}

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="confirmNewPasswordProfDialog" className="text-right col-span-1">Confirm</Label>
                    <Input id="confirmNewPasswordProfDialog" name="confirmNewPassword" type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="col-span-3" required />
                  </div>
                  {passwordFormState.errors?.confirmNewPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.confirmNewPassword.join(', ')}</p>}
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isAnyActionPending} className="ml-auto">
                    {isPasswordActionPending || isPasswordTransitionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Update Password
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <Separator />
            
            <form onSubmit={handleSettingsSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Personal Preferences</CardTitle>
                  <CardDescription>These settings are specific to your account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                  {settingsFormState.errors?._form && (
                    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><ShadcnAlertTitle>Error</ShadcnAlertTitle><AlertDescription>{settingsFormState.errors._form.join(', ')}</AlertDescription></Alert>
                  )}

                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label htmlFor="user-profile-debug-mode" className="font-normal flex-grow">Enable Debug Mode for your session</Label>
                    <Switch 
                      id="user-profile-debug-mode" 
                      checked={safeUserSettings.debugMode} 
                      onCheckedChange={(checked) => setUserSettings(prev => ({...prev, debugMode: checked}))}
                    />
                  </div>
                   {settingsFormState.errors?.debugMode && <p className="text-xs text-destructive">{(settingsFormState.errors.debugMode as string[]).join(', ')}</p>}

                  <h4 className="font-medium text-muted-foreground text-sm pt-2">Popup Notifications</h4>
                  <div className="space-y-2">
                    <Label htmlFor="user-profile-popup-duration-slider" className="text-xs">Notification Duration (seconds)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="user-profile-popup-duration-slider"
                        min={2} max={15} step={1}
                        value={[safeUserSettings.popup.notificationDuration]}
                        onValueChange={(value) => handlePopupSettingChange('notificationDuration', value[0])}
                        className="flex-grow"
                      />
                      <Input
                        type="number"
                        value={safeUserSettings.popup.notificationDuration}
                        onChange={(e) => handlePopupSettingChange('notificationDuration', parseInt(e.target.value, 10))}
                        min={2} max={15}
                        className="w-20 h-8 text-xs"
                      />
                    </div>
                     {settingsFormState.errors?.popup?.notificationDuration && <p className="text-xs text-destructive">{(settingsFormState.errors.popup.notificationDuration as string[]).join(', ')}</p>}
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label htmlFor="user-profile-popup-disable-all" className="font-normal text-sm flex-grow">Disable All Notifications</Label>
                    <Switch id="user-profile-popup-disable-all" checked={safeUserSettings.popup.disableAllNotifications} onCheckedChange={(checked) => handlePopupSettingChange('disableAllNotifications', checked)} />
                  </div>
                  {settingsFormState.errors?.popup?.disableAllNotifications && <p className="text-xs text-destructive">{(settingsFormState.errors.popup.disableAllNotifications as string[]).join(', ')}</p>}

                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label htmlFor="user-profile-popup-disable-autoclose" className="font-normal text-sm flex-grow">Disable Auto-Closing Notifications</Label>
                    <Switch id="user-profile-popup-disable-autoclose" checked={safeUserSettings.popup.disableAutoClose} onCheckedChange={(checked) => handlePopupSettingChange('disableAutoClose', checked)} />
                  </div>
                  {settingsFormState.errors?.popup?.disableAutoClose && <p className="text-xs text-destructive">{(settingsFormState.errors.popup.disableAutoClose as string[]).join(', ')}</p>}
                  
                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label htmlFor="user-profile-popup-enable-copy" className="font-normal text-sm flex-grow">Enable 'Copy Error' on Error Popups</Label>
                    <Switch id="user-profile-popup-enable-copy" checked={safeUserSettings.popup.enableCopyError} onCheckedChange={(checked) => handlePopupSettingChange('enableCopyError', checked)} />
                  </div>
                  {settingsFormState.errors?.popup?.enableCopyError && <p className="text-xs text-destructive">{(settingsFormState.errors.popup.enableCopyError as string[]).join(', ')}</p>}

                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label htmlFor="user-profile-popup-show-console-errors" className="font-normal text-sm flex-grow">Show Console Errors in Notifications (if your Debug Mode is on)</Label>
                    <Switch id="user-profile-popup-show-console-errors" checked={safeUserSettings.popup.showConsoleErrorsInNotifications} onCheckedChange={(checked) => handlePopupSettingChange('showConsoleErrorsInNotifications', checked)} />
                  </div>
                  {settingsFormState.errors?.popup?.showConsoleErrorsInNotifications && <p className="text-xs text-destructive">{(settingsFormState.errors.popup.showConsoleErrorsInNotifications as string[]).join(', ')}</p>}

                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isAnyActionPending} className="ml-auto">
                     {isSettingsActionPending || isSettingsTransitionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Preferences
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          <DialogClose asChild>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isAnyActionPending}>
               <X className="mr-2 h-4 w-4" /> Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
