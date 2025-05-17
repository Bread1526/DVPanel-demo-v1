
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Save, Loader2, AlertCircle } from "lucide-react";
import { savePanelSettings, loadPanelSettings } from '../actions';
import type { SavePanelSettingsState, PanelSettingsData } from '../types';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; 
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogCoreDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogCoreTitle } from "@/components/ui/alert-dialog";
import { useRouter } from 'next/navigation';
import { logout as serverLogoutAction } from '@/app/(app)/logout/actions'; 

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
  isPending: false,
};

const defaultGlobalSettingsData: PanelSettingsData = {
  panelPort: "27407",
  panelIp: "",
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};

export default function SecuritySettingsPage() {
  const [allLoadedSettings, setAllLoadedSettings] = useState<PanelSettingsData>(defaultGlobalSettingsData);
  
  const [currentSessionInactivityTimeout, setCurrentSessionInactivityTimeout] = useState(defaultGlobalSettingsData.sessionInactivityTimeout);
  const [currentDisableAutoLogout, setCurrentDisableAutoLogout] = useState(defaultGlobalSettingsData.disableAutoLogoutOnInactivity);
  
  const [showLogoutConfirmDialog, setShowLogoutConfirmDialog] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(
    (prevState: SavePanelSettingsState, data: PanelSettingsData) => savePanelSettings(prevState, data, undefined), 
    initialSaveState
  );

  const fetchSettings = useCallback(async () => {
    const result = await loadPanelSettings();
    if (result && result.data) {
      setAllLoadedSettings(result.data); 
      setCurrentSessionInactivityTimeout(result.data.sessionInactivityTimeout ?? defaultGlobalSettingsData.sessionInactivityTimeout);
      setCurrentDisableAutoLogout(result.data.disableAutoLogoutOnInactivity ?? defaultGlobalSettingsData.disableAutoLogoutOnInactivity);
    } else if (result && result.message && result.status !== 'success'){
       toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const toastDuration = 5000; 

    if (formState.status === "success" && formState.message) {
      let settingsChangedRequiresLogout = false;
      if (formState.data) {
        if (formState.data.sessionInactivityTimeout !== allLoadedSettings.sessionInactivityTimeout ||
            formState.data.disableAutoLogoutOnInactivity !== allLoadedSettings.disableAutoLogoutOnInactivity) {
          settingsChangedRequiresLogout = true;
        }
        setAllLoadedSettings(formState.data); 
        setCurrentSessionInactivityTimeout(formState.data.sessionInactivityTimeout ?? defaultGlobalSettingsData.sessionInactivityTimeout);
        setCurrentDisableAutoLogout(formState.data.disableAutoLogoutOnInactivity ?? defaultGlobalSettingsData.disableAutoLogoutOnInactivity);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: toastDuration,
      });
      if (settingsChangedRequiresLogout) {
          setShowLogoutConfirmDialog(true);
      }

    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
       if (formState.errors?.general?.length) {
          description = formState.errors.general.join('; ');
      } else if (formState.errors?.sessionInactivityTimeout?.length) {
          description = (formState.errors.sessionInactivityTimeout as string[]).join('; ');
      } else if (formState.errors?.disableAutoLogoutOnInactivity?.length) {
          description = (formState.errors.disableAutoLogoutOnInactivity as string[]).join('; ');
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: toastDuration,
      });
    }
  }, [formState, allLoadedSettings.sessionInactivityTimeout, allLoadedSettings.disableAutoLogoutOnInactivity, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedData: PanelSettingsData = {
      ...allLoadedSettings, 
      sessionInactivityTimeout: currentSessionInactivityTimeout, 
      disableAutoLogoutOnInactivity: currentDisableAutoLogout,
    };
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  }, [allLoadedSettings, currentSessionInactivityTimeout, currentDisableAutoLogout, startTransitionForAction, formAction]);

  const handleLogoutForSettingsChange = useCallback(async () => {
    setShowLogoutConfirmDialog(false);
    try {
        await serverLogoutAction(undefined, undefined); 
    } catch(e){
        console.error("Error during server logout action:", e);
    }
    router.push('/login?reason=settings_changed');
  }, [router]); 
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Security Settings" description="Enhance your panel's security posture." />
      <form onSubmit={handleFormSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Session Management</CardTitle>
            <CardDescription>Control how user sessions are handled for inactivity. Changes may require a re-login to fully apply to your current session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {formState.status === "error" && formState.errors?._form && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{formState.errors._form.join('; ')}</AlertDescription>
                </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="session-timeout">Session Inactivity Timeout (minutes)</Label>
              <Input 
                id="session-timeout" 
                name="sessionInactivityTimeout"
                type="number" 
                value={currentSessionInactivityTimeout}
                onChange={(e) => setCurrentSessionInactivityTimeout(parseInt(e.target.value, 10) || 1)} 
                className="md:col-span-2" 
                min="1"
                disabled={currentDisableAutoLogout}
                required
              />
            </div>
            {formState.errors?.sessionInactivityTimeout && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                 <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{(formState.errors.sessionInactivityTimeout as string[]).join(', ')}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="disable-auto-logout" className="text-base font-semibold">Disable Auto Logout on Inactivity</Label>
                <p className="text-sm text-muted-foreground">
                  If enabled, users will not be logged out due to inactivity. Session cookie lifetime still applies.
                </p>
              </div>
              <Switch 
                id="disable-auto-logout"
                name="disableAutoLogoutOnInactivity"
                checked={currentDisableAutoLogout}
                onCheckedChange={setCurrentDisableAutoLogout}
              />
            </div>
            {formState.errors?.disableAutoLogoutOnInactivity && (
              <Alert variant="destructive">
                <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{(formState.errors.disableAutoLogoutOnInactivity as string[]).join(', ')}</AlertDescription>
              </Alert>
            )}
             {formState.errors?.general && (
                <Alert variant="destructive" className="mt-4 md:col-span-3">
                    <AlertTitle>Form Error</AlertTitle>
                    <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
                </Alert>
            )}
          </CardContent>
           <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Session Settings
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Other Security Features</CardTitle>
          <CardDescription>(Functionality pending for IP Whitelisting, 2FA, etc.)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div>
            <Label className="text-base font-semibold">IP Whitelisting</Label>
            <p className="text-sm text-muted-foreground mb-2">Allow access only from specific IP addresses for selected ports.</p>
            <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>Manage IP Whitelist</Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="2fa" className="text-base font-semibold">Two-Factor Authentication (2FA)</Label>
              <p className="text-sm text-muted-foreground">Require a second form of verification for logins.</p>
            </div>
            <Switch id="2fa" disabled />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showLogoutConfirmDialog} onOpenChange={setShowLogoutConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogCoreTitle>Session Settings Changed</AlertDialogCoreTitle>
            <AlertDialogCoreDescription>
              Your session inactivity settings have been updated. These changes will apply globally on the next login for all users. 
              For these changes to affect your current session, you would need to log out and log back in.
              The new settings will automatically apply to your next new session.
            </AlertDialogCoreDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLogoutConfirmDialog(false)}>Okay, Got It</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutForSettingsChange} className="bg-destructive hover:bg-destructive/80">Log Out Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
