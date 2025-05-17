
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Loader2, Save, UserCircle, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type AuthenticatedUser } from '@/lib/session';
import { 
  updateUserPassword, 
  updateCurrentUserSpecificSettings, 
  type UpdatePasswordState, 
  type UpdateUserSettingsState 
} from '../actions';
import { type UserSettingsData, defaultUserSettings } from '@/lib/user-settings';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from '@/components/ui/separator';

interface ProfileDialogProps {
  currentUser: AuthenticatedUser | null;
  onSettingsUpdate?: () => void; // Callback to refetch user data in AppShell
}

const initialPasswordState: UpdatePasswordState = { message: "", status: "idle", errors: {} };
const initialSettingsState: UpdateUserSettingsState = { message: "", status: "idle", errors: {}, data: undefined };

export default function ProfileDialog({ currentUser, onSettingsUpdate }: ProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordFormState, passwordFormAction, isPasswordActionPending] = useActionState(updateUserPassword, initialPasswordState);
  const [isPasswordTransitionPending, startPasswordTransition] = useTransition();

  // User-specific settings state
  const [userSettings, setUserSettings] = useState<UserSettingsData>(currentUser?.userSettings || defaultUserSettings);
  const [settingsFormState, settingsFormAction, isSettingsActionPending] = useActionState(updateCurrentUserSpecificSettings, initialSettingsState);
  const [isSettingsTransitionPending, startSettingsTransition] = useTransition();


  useEffect(() => {
    if (currentUser?.userSettings) {
      setUserSettings(currentUser.userSettings);
    } else {
      setUserSettings(defaultUserSettings);
    }
  }, [currentUser, open]); // Reset/update on open based on potentially new currentUser prop

  // Effect for password change action
  useEffect(() => {
    if (passwordFormState.status === "success") {
      toast({ title: "Success", description: passwordFormState.message });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      // Optionally close dialog or reset part of it
    } else if (passwordFormState.status === "error" && passwordFormState.message && !passwordFormState.errors?._form) {
      toast({ title: "Password Change Error", description: passwordFormState.message, variant: "destructive" });
    }
  }, [passwordFormState, toast]);

  // Effect for user-specific settings action
  useEffect(() => {
    if (settingsFormState.status === "success") {
      toast({ title: "Settings Updated", description: settingsFormState.message });
      if (settingsFormState.data) {
        setUserSettings(settingsFormState.data); // Update local state with saved data
      }
      onSettingsUpdate?.(); // Trigger refetch in AppShell
    } else if (settingsFormState.status === "error" && settingsFormState.message && !settingsFormState.errors?._form) {
      toast({ title: "Settings Error", description: settingsFormState.message, variant: "destructive" });
    }
  }, [settingsFormState, toast, onSettingsUpdate]);


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
    // Construct settingsData from state
    startSettingsTransition(() => {
      settingsFormAction(userSettings);
    });
  };

  const handleSettingChange = <K extends keyof UserSettingsData>(key: K, value: UserSettingsData[K]) => {
    setUserSettings(prev => ({ ...prev, [key]: value }));
  };

  const handlePopupSettingChange = <K extends keyof UserSettingsData['popup']>(key: K, value: UserSettingsData['popup'][K]) => {
    setUserSettings(prev => ({
      ...prev,
      popup: {
        ...prev.popup,
        [key]: value,
      }
    }));
  };
  
  const isPasswordPending = isPasswordActionPending || isPasswordTransitionPending;
  const isSettingsPending = isSettingsActionPending || isSettingsTransitionPending;

  if (!currentUser) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 px-2 text-sm h-auto py-1.5">
          <UserCircle className="mr-2 h-4 w-4" />Profile & Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>My Profile & User Settings</DialogTitle>
          <DialogDescription>Manage your password and personal panel preferences.</DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-8 max-h-[70vh] overflow-y-auto pr-2">
          {/* User Info Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium text-muted-foreground">Username:</span> {currentUser.username}</p>
              <p><span className="font-medium text-muted-foreground">Role:</span> {currentUser.role}</p>
            </CardContent>
          </Card>

          {/* Change Password Section */}
          <form onSubmit={handlePasswordSubmit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {passwordFormState.status === "error" && passwordFormState.errors?._form && (
                    <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{passwordFormState.errors._form.join(', ')}</AlertDescription>
                    </Alert>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="currentPassword" className="text-right col-span-1">Current Password</Label>
                  <Input id="currentPassword" name="currentPassword" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="col-span-3" required />
                </div>
                {passwordFormState.errors?.currentPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.currentPassword.join(', ')}</p>}
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="newPassword" className="text-right col-span-1">New Password</Label>
                  <Input id="newPassword" name="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="col-span-3" required />
                </div>
                 {passwordFormState.errors?.newPassword && <p className="text-xs text-destructive col-start-2 col-span-3">{passwordFormState.errors.newPassword.join(', ')}</p>}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="confirmNewPassword" className="text-right col-span-1">Confirm New Password</Label>
                  <Input id="confirmNewPassword" name="confirmNewPassword" type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="col-span-3" required />
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

          <Separator />

          {/* User-Specific Settings Section */}
          <form onSubmit={handleSettingsSubmit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Preferences</CardTitle>
                 <CardDescription>These settings only affect your experience.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {settingsFormState.status === "error" && settingsFormState.errors?._form && (
                    <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{settingsFormState.errors._form.join(', ')}</AlertDescription>
                    </Alert>
                )}
                {/* Debug Mode Switch */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="user-debug-mode" className="text-base font-semibold">Enable Debug Mode</Label>
                    <p className="text-sm text-muted-foreground">Show verbose logs and more detailed error messages for your account.</p>
                  </div>
                  <Switch 
                    id="user-debug-mode" 
                    checked={userSettings.debugMode} 
                    onCheckedChange={(checked) => handleSettingChange('debugMode', checked)}
                  />
                </div>
                 {settingsFormState.errors?.debugMode && <p className="text-xs text-destructive">{settingsFormState.errors.debugMode.join(', ')}</p>}


                {/* Popup Settings */}
                <h4 className="text-md font-semibold pt-4 border-t">Notification Popups</h4>
                <div className="space-y-2">
                  <Label htmlFor="user-popup-duration-slider">Notification Duration (seconds)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      id="user-popup-duration-slider"
                      min={2} max={15} step={1}
                      value={[userSettings.popup.notificationDuration]}
                      onValueChange={(value) => handlePopupSettingChange('notificationDuration', value[0])}
                      className="flex-grow"
                    />
                    <Input
                      type="number"
                      value={userSettings.popup.notificationDuration}
                      onChange={(e) => handlePopupSettingChange('notificationDuration', parseInt(e.target.value, 10))}
                      min={2} max={15}
                      className="w-20"
                    />
                  </div>
                  {settingsFormState.errors?.popup?.notificationDuration && <p className="text-xs text-destructive">{settingsFormState.errors.popup.notificationDuration.join(', ')}</p>}
                </div>

                <div className="flex items-center justify-between p-3 border rounded-md">
                  <Label htmlFor="user-popup-disable-all" className="font-normal">Disable All Notifications</Label>
                  <Switch id="user-popup-disable-all" checked={userSettings.popup.disableAllNotifications} onCheckedChange={(checked) => handlePopupSettingChange('disableAllNotifications', checked)} />
                </div>
                {settingsFormState.errors?.popup?.disableAllNotifications && <p className="text-xs text-destructive">{settingsFormState.errors.popup.disableAllNotifications.join(', ')}</p>}


                <div className="flex items-center justify-between p-3 border rounded-md">
                  <Label htmlFor="user-popup-disable-autoclose" className="font-normal">Disable Auto-Closing Notifications</Label>
                  <Switch id="user-popup-disable-autoclose" checked={userSettings.popup.disableAutoClose} onCheckedChange={(checked) => handlePopupSettingChange('disableAutoClose', checked)} />
                </div>
                 {settingsFormState.errors?.popup?.disableAutoClose && <p className="text-xs text-destructive">{settingsFormState.errors.popup.disableAutoClose.join(', ')}</p>}

                <div className="flex items-center justify-between p-3 border rounded-md">
                  <Label htmlFor="user-popup-enable-copy" className="font-normal">Enable 'Copy Error' Button on Error Popups</Label>
                  <Switch id="user-popup-enable-copy" checked={userSettings.popup.enableCopyError} onCheckedChange={(checked) => handlePopupSettingChange('enableCopyError', checked)} />
                </div>
                {settingsFormState.errors?.popup?.enableCopyError && <p className="text-xs text-destructive">{settingsFormState.errors.popup.enableCopyError.join(', ')}</p>}
                
                <div className="flex items-center justify-between p-3 border rounded-md">
                  <Label htmlFor="user-popup-show-console-errors" className="font-normal">Show Console Errors in Notifications (if Debug Mode on)</Label>
                  <Switch id="user-popup-show-console-errors" checked={userSettings.popup.showConsoleErrorsInNotifications} onCheckedChange={(checked) => handlePopupSettingChange('showConsoleErrorsInNotifications', checked)} />
                </div>
                 {settingsFormState.errors?.popup?.showConsoleErrorsInNotifications && <p className="text-xs text-destructive">{settingsFormState.errors.popup.showConsoleErrorsInNotifications.join(', ')}</p>}
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSettingsPending} className="ml-auto">
                  {isSettingsPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Preferences
                </Button>
              </CardFooter>
            </Card>
          </form>

        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
