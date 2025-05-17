
"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input"; // Added Input
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from '../actions';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  // Add state for other security-specific inputs if any in the future
  // const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      if (result.data) {
        setAllSettings(result.data);
        setCurrentSessionInactivityTimeout(result.data.sessionInactivityTimeout ?? defaultSettingsData.sessionInactivityTimeout);
        setCurrentDisableAutoLogout(result.data.disableAutoLogoutOnInactivity ?? defaultSettingsData.disableAutoLogoutOnInactivity);
        // setTwoFactorEnabled(result.data.security?.twoFactor ?? false);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const toastDurationSource = formState.data?.popup?.notificationDuration ?? allSettings.popup.notificationDuration;
    const effectiveDuration = toastDurationSource * 1000;

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllSettings(formState.data);
        setCurrentSessionInactivityTimeout(formState.data.sessionInactivityTimeout ?? defaultSettingsData.sessionInactivityTimeout);
        setCurrentDisableAutoLogout(formState.data.disableAutoLogoutOnInactivity ?? defaultSettingsData.disableAutoLogoutOnInactivity);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      if (formState.errors?.general) {
          description = formState.errors.general.join('; ');
      } else if (formState.errors?.sessionInactivityTimeout) {
          description = formState.errors.sessionInactivityTimeout.join('; ');
      } else if (formState.errors?.disableAutoLogoutOnInactivity) {
          description = formState.errors.disableAutoLogoutOnInactivity.join('; ');
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration,
      });
    }
  }, [formState, allSettings.popup.notificationDuration, toast]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings,
      sessionInactivityTimeout: currentSessionInactivityTimeout,
      disableAutoLogoutOnInactivity: currentDisableAutoLogout,
      // security: { 
      //   twoFactor: twoFactorEnabled,
      // },
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  };
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Security Settings" description="Enhance your panel's security posture." />
      <form onSubmit={handleFormSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Session Management</CardTitle>
            <CardDescription>Control how user sessions are handled for inactivity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="session-timeout">Session Inactivity Timeout (minutes)</Label>
              <Input 
                id="session-timeout" 
                type="number" 
                value={currentSessionInactivityTimeout}
                onChange={(e) => setCurrentSessionInactivityTimeout(parseInt(e.target.value, 10))}
                className="md:col-span-2" 
                min="1"
              />
            </div>
            {formState.errors?.sessionInactivityTimeout && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                <AlertDescription>{formState.errors.sessionInactivityTimeout.join(', ')}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="disable-auto-logout" className="text-base font-semibold">Disable Auto Logout on Inactivity</Label>
                <p className="text-sm text-muted-foreground">
                  If enabled, users will not be logged out due to inactivity. Session will only expire based on cookie lifetime.
                </p>
              </div>
              <Switch 
                id="disable-auto-logout"
                checked={currentDisableAutoLogout}
                onCheckedChange={setCurrentDisableAutoLogout}
              />
            </div>
            {formState.errors?.disableAutoLogoutOnInactivity && (
              <Alert variant="destructive"><AlertDescription>{formState.errors.disableAutoLogoutOnInactivity.join(', ')}</AlertDescription></Alert>
            )}
          </CardContent>
        </Card>

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

            <div>
              <Label className="text-base font-semibold">Rate Limiting</Label>
              <div className="space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm">Login Attempts</p>
                  <Switch id="rate-limit-login" defaultChecked disabled />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm">API Usage</p>
                  <Switch id="rate-limit-api" disabled />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm">Project Start/Stop Actions</p>
                  <Switch id="rate-limit-project" defaultChecked disabled />
                </div>
              </div>
            </div>
             {formState.errors?.general && (
                <Alert variant="destructive" className="mt-4">
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
    </div>
  );
}
