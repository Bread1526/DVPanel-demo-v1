
"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from '../actions';
import { useToast } from "@/hooks/use-toast";

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
};

export default function SecuritySettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  // Add state for security-specific inputs if any in the future
  // const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      if (result.data) {
        setAllSettings(result.data);
        // Populate security-specific state if any
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
        // Update security-specific state if any
      }
      toast({
        title: "Settings Update",
        description: formState.message, // This will show "Panel settings saved successfully"
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      toast({
        title: "Error Saving Settings",
        description: formState.message,
        variant: "destructive",
        duration: effectiveDuration,
      });
    }
  }, [formState, allSettings.popup.notificationDuration]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings,
      // security: { // Example if security settings were part of PanelSettingsData
      //   twoFactor: twoFactorEnabled,
      // },
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); // Saves ALL settings
    });
  };
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Security Settings" description="Enhance your panel's security posture." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Security Configuration</CardTitle>
            <CardDescription>(Functionality pending for separate security settings saving)</CardDescription>
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
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Security Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

