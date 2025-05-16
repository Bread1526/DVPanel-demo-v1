
"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function GeneralSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  // Add state for general-specific inputs if any in the future

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      if (result.data) {
        setAllSettings(result.data);
        // Populate general-specific state if any
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
        // Update general-specific state if any
      }
      toast({
        title: "Settings Update",
        description: formState.message,
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
      // general: { ... } // Example if general settings were part of PanelSettingsData
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); // Saves ALL settings
    });
  };
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="General Settings" description="Configure general behavior and preferences for DVPanel." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>General Application Settings</CardTitle>
            <CardDescription>(Functionality pending)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              General settings for panel administration, such as changing the panel owner username and password (encrypted), will be available here in a future update.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save General Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
