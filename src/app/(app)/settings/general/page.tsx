
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
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
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};

export default function GeneralSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await loadPanelSettings();
        if (result && result.data) { // Added check for result itself
          setAllSettings(result.data);
        } else if (result && result.message && result.status !== 'success') {
            toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch (e) {
        toast({ title: "Error Loading Settings", description: "An unexpected error occurred.", variant: "destructive" });
        console.error("Failed to load settings in General page:", e);
      }
    };
    fetchSettings();
  }, [toast]);

  useEffect(() => {
    const toastDurationSource = formState.data?.popup?.notificationDuration ?? allSettings.popup?.notificationDuration;
    const effectiveDuration = (toastDurationSource || 5) * 1000;

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllSettings(formState.data);
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
  }, [formState, allSettings.popup?.notificationDuration, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings, 
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  }, [allSettings, startTransitionForAction, formAction]);
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="General Settings" description="Configure general behavior and preferences for DVPanel." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>General Application Settings</CardTitle>
            <CardDescription>(Functionality pending for changing owner credentials. Settings related to this (e.g., via an `info.json`) are not yet implemented.)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              This section will allow management of core panel settings, including owner account credentials (stored encrypted). Currently, owner credentials are managed via `.env.local`.
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
