
"use client";

import React, { useState, useEffect, useTransition } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Added AlertTitle
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogCoreTitle } from "@/components/ui/alert-dialog"; // Added AlertDialog components
import { useRouter } from 'next/navigation'; // For redirecting after logout
import { logout } from '@/app/(app)/logout/actions'; // For logout action
import { type LocalSessionInfo } from '@/lib/session';

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
    const effectiveDuration = toastDurationSource * 1000;

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllSettings(formState.data); // Keep all settings in sync
        setCurrentSessionInactivityTimeout(formState.data.sessionInactivityTimeout ?? defaultSettingsData.sessionInactivityTimeout);
        setCurrentDisableAutoLogout(formState.data.disableAutoLogoutOnInactivity ?? defaultSettingsData.disableAutoLogoutOnInactivity);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
      // Check if session-related settings were part of the save.
      // This is a heuristic; ideally, formState.data would tell us exactly what changed.
      // For now, assume if security settings were submitted, these might have changed.
      if (formState.data && (
          formState.data.sessionInactivityTimeout !== allSettings.sessionInactivityTimeout ||
          formState.data.disableAutoLogoutOnInactivity !== allSettings.disableAutoLogoutOnInactivity
      )) {
          setShowLogoutConfirmDialog(true);
      }

    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      // Simplified error display logic
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

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings, // Start with all current settings
      sessionInactivityTimeout: currentSessionInactivityTimeout, // Override with values from this page
      disableAutoLogoutOnInactivity: currentDisableAutoLogout,
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  };

  const handleLogoutForSettingsChange = async () => {
    setShowLogoutConfirmDialog(false);
    const storedSession = localStorage.getItem('dvpanel-session');
    if (storedSession) {
        try {
            const session: LocalSessionInfo = JSON.parse(storedSession);
            await logout(session.username, session.role);
        } catch (e) {
            console.error("Error parsing session from localStorage during settings logout", e);
        }
    }
    localStorage.removeItem('dvpanel-session');
    router.push('/login?reason=settings_changed');
  };
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Security Settings" description="Enhance your panel's security posture." />
      <form onSubmit={handleFormSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Session Management</CardTitle>
            <CardDescription>Control how user sessions are handled for inactivity. Changes apply to new logins or after your current session re-authenticates (e.g., after logout/login).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="session-timeout">Session Inactivity Timeout (minutes)</Label>
              <Input 
                id="session-timeout" 
                type="number" 
                value={currentSessionInactivityTimeout}
                onChange={(e) => setCurrentSessionInactivityTimeout(parseInt(e.target.value, 10) || 1)} // Ensure it's at least 1
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
                  If enabled, users will not be logged out due to inactivity. Sessions will only expire based on other factors (e.g., manual logout).
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
          </CardContent>
        </Card>

        {/* Placeholder for other security features */}
        <Card>
          <CardHeader>
            <CardTitle>Other Security Features</CardTitle>
            <CardDescription>(Functionality pending for IP Whitelisting, 2FA, and Rate Limiting)</CardDescription>
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
              Save Security Settings
            </Button>
          </CardFooter>
        </Card>
      </form>

      <AlertDialog open={showLogoutConfirmDialog} onOpenChange={setShowLogoutConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogCoreTitle>Session Settings Changed</AlertDialogCoreTitle>
            <AlertDialogDescription>
              Your session inactivity settings have been updated. These changes will apply globally on the next login for all users. 
              For these changes to affect your current session, you would need to log out and log back in.
              The new settings will automatically apply to your next new session.
            </AlertDialogDescription>
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
