
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from '../actions';
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
};

const defaultSettingsData: PanelSettingsData = {
  panelPort: "27407",
  panelIp: "",
  debugMode: false,
  popup: {
    notificationDuration: 5,
    disableAllNotifications: false,
    disableAutoClose: false,
    enableCopyError: false,
    showConsoleErrorsInNotifications: false,
  },
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};

export default function SecuritySettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  const [currentSessionInactivityTimeout, setCurrentSessionInactivityTimeout] = useState(defaultSettingsData.sessionInactivityTimeout);
  const [currentDisableAutoLogout, setCurrentDisableAutoLogout] = useState(defaultSettingsData.disableAutoLogoutOnInactivity);
  
  const [showLogoutConfirmDialog, setShowLogoutConfirmDialog] = useState(false);

  const { toast } = useToast();
  const router = useRouter();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      if (result.data) {
        setAllSettings(result.data);
        setCurrentSessionInactivityTimeout(result.data.sessionInactivityTimeout ?? defaultSettingsData.sessionInactivityTimeout);
        setCurrentDisableAutoLogout(result.data.disableAutoLogoutOnInactivity ?? defaultSettingsData.disableAutoLogoutOnInactivity);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const toastDurationSource = formState.data?.popup?.notificationDuration ?? allSettings.popup.notificationDuration;
    const effectiveDuration = (toastDurationSource || 5) * 1000;

    if (formState.status === "success" && formState.message) {
      let settingsChangedRequiresLogout = false;
      if (formState.data) {
        if (formState.data.sessionInactivityTimeout !== allSettings.sessionInactivityTimeout ||
            formState.data.disableAutoLogoutOnInactivity !== allSettings.disableAutoLogoutOnInactivity) {
          settingsChangedRequiresLogout = true;
        }
        setAllSettings(formState.data); 
        setCurrentSessionInactivityTimeout(formState.data.sessionInactivityTimeout ?? defaultSettingsData.sessionInactivityTimeout);
        setCurrentDisableAutoLogout(formState.data.disableAutoLogoutOnInactivity ?? defaultSettingsData.disableAutoLogoutOnInactivity);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
      if (settingsChangedRequiresLogout) {
          setShowLogoutConfirmDialog(true);
      }

    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      if (formState.errors?.general?.length) {
          description = formState.errors.general.join('; ');
      } else if (formState.errors?.sessionInactivityTimeout?.length) {
          description = formState.errors.sessionInactivityTimeout.join('; ');
      } else if (formState.errors?.disableAutoLogoutOnInactivity?.length) {
          description = formState.errors.disableAutoLogoutOnInactivity.join('; ');
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration,
      });
    }
  }, [formState, allSettings.popup.notificationDuration, allSettings.sessionInactivityTimeout, allSettings.disableAutoLogoutOnInactivity, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings, 
      sessionInactivityTimeout: currentSessionInactivityTimeout, 
      disableAutoLogoutOnInactivity: currentDisableAutoLogout,
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  }, [allSettings, currentSessionInactivityTimeout, currentDisableAutoLogout, startTransitionForAction, formAction]);

  const handleLogoutForSettingsChange = useCallback(async () => {
    setShowLogoutConfirmDialog(false);
    try {
        await serverLogoutAction(); // This will destroy cookie and server session file.
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
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="session-timeout">Session Inactivity Timeout (minutes)</Label>
              <Input 
                id="session-timeout" 
                type="number" 
                value={currentSessionInactivityTimeout}
                onChange={(e) => setCurrentSessionInactivityTimeout(parseInt(e.target.value, 10) || 1)} 
                className="md:col-span-2" 
                min="1"
                disabled={currentDisableAutoLogout}
              />
            </div>
            {formState.errors?.sessionInactivityTimeout && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                 <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{formState.errors.sessionInactivityTimeout.join(', ')}</AlertDescription>
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
                checked={currentDisableAutoLogout}
                onCheckedChange={setCurrentDisableAutoLogout}
              />
            </div>
            {formState.errors?.disableAutoLogoutOnInactivity && (
              <Alert variant="destructive">
                <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{formState.errors.disableAutoLogoutOnInactivity.join(', ')}</AlertDescription>
              </Alert>
            )}
             {formState.errors?.general && (
                <Alert variant="destructive" className="mt-4">
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

      {/* Placeholder for other security features */}
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
