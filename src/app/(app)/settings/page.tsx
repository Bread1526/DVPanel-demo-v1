
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings } from './actions';
import type { SavePanelSettingsState, PanelSettingsData } from './types';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Added AlertTitle

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
  isPending: false,
};

// This is used for initializing local state and as a fallback.
// It's critical that it matches the structure and defaults of panelSettingsSchema in types.ts
const defaultPanelSettingsData: PanelSettingsData = {
  panelPort: "27407",
  panelIp: "",
  // debugMode and popup are no longer part of global settings
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};

export default function PanelSettingsPage() {
  // This state holds ALL settings that can be managed by this global settings file
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultPanelSettingsData);
  
  // Local state specifically for the inputs on THIS page
  const [currentPanelPort, setCurrentPanelPort] = useState(defaultPanelSettingsData.panelPort);
  const [currentPanelIp, setCurrentPanelIp] = useState(defaultPanelSettingsData.panelIp || "");

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition(); 
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  const fetchSettings = useCallback(async () => {
    console.log("[PanelSettingsPage] useEffect: Calling loadPanelSettings");
    try {
      const result = await loadPanelSettings();
      console.log("[PanelSettingsPage] useEffect: loadPanelSettings result:", result);
      if (result && result.data) {
        setAllSettings(result.data); // Store all loaded settings
        setCurrentPanelPort(result.data.panelPort); // Set specific field for this page
        setCurrentPanelIp(result.data.panelIp || ""); // Set specific field for this page
        console.log("[PanelSettingsPage] Settings loaded and state updated:", result.data);
      } else if (result && result.message && result.status !== 'success'){
         toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
      }
    } catch (e) {
       const error = e instanceof Error ? e : new Error(String(e));
       toast({ title: "Error Loading Settings", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
       console.error("Failed to load settings in Panel page:", e);
    }
  }, [toast]); // Removed currentPanelPort, currentPanelIp as they are set inside

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]); 

  useEffect(() => {
    // const toastDurationSource = formState.data?.popup?.notificationDuration ?? allSettings.popup?.notificationDuration;
    // Popup settings are user-specific now, so use a default or a global app config for toast duration.
    const effectiveDuration = 5000; // Default 5 seconds

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllSettings(formState.data); // Update the comprehensive settings state
        setCurrentPanelPort(formState.data.panelPort); // Update local state for this page's inputs
        setCurrentPanelIp(formState.data.panelIp || "");
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
       let description = formState.message;
      if (formState.errors?.general?.length) {
        description = formState.errors.general.join('; '); 
      } else if (formState.errors?.panelPort?.length) {
        description = formState.errors.panelPort.join('; ');
      } else if (formState.errors?.panelIp?.length) {
        description = formState.errors.panelIp.join('; ');
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration, 
        // errorContent: formState.errors?.general?.join('; ') || Object.values(formState.errors || {}).flat().join('; ') // errorContent for copy not fully implemented yet
      });
    }
  }, [formState, toast]); // Removed allSettings.popup as it's no longer global

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("[PanelSettingsPage] handleFormSubmit: currentPanelPort", currentPanelPort, "currentPanelIp", currentPanelIp);
    
    // Construct the full settings object to send to the action
    // Use current state for fields on this page, and existing loaded values for others
    const submittedData: PanelSettingsData = {
      ...allSettings, // Start with all previously loaded settings
      panelPort: currentPanelPort, 
      panelIp: currentPanelIp,     
      // Other settings like sessionInactivityTimeout will be from allSettings
    };
    console.log("[PanelSettingsPage] handleFormSubmit: Submitting with data:", submittedData);
    
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  }, [allSettings, currentPanelPort, currentPanelIp, startTransitionForAction, formAction]);
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader 
        title="Panel Settings" 
        description="Customize how your DVPanel is accessed and operates. Settings are encrypted."
      />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Panel Access Configuration</CardTitle>
            <CardDescription>Changes require a panel restart to take effect.</CardDescription>
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
              <Label htmlFor="panel-port-input">Panel Port</Label>
              <Input 
                id="panel-port-input" 
                name="panelPort" 
                type="number" 
                value={currentPanelPort}
                onChange={(e) => setCurrentPanelPort(e.target.value)}
                className="md:col-span-2" 
                required
              />
            </div>
            {formState.errors?.panelPort && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                 <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{formState.errors.panelPort.join(', ')}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="panel-ip-input">Panel IP/Domain</Label>
              <Input 
                id="panel-ip-input" 
                name="panelIp"
                value={currentPanelIp}
                onChange={(e) => setCurrentPanelIp(e.target.value)}
                placeholder="e.g., 0.0.0.0 or mypanel.example.com (leave blank for 0.0.0.0)" 
                className="md:col-span-2" 
              />
            </div>
            {formState.errors?.panelIp && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                 <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{formState.errors.panelIp.join(', ')}</AlertDescription>
              </Alert>
            )}
            {formState.errors?.general && (
              <Alert variant="destructive" className="md:col-span-3">
                <AlertTitle>Form Error</AlertTitle>
                <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground md:col-span-3 md:pl-[calc(33.33%+1rem)]">
              If using a domain, ensure your reverse proxy (e.g., Nginx) is configured correctly to forward requests to the panel port.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Panel Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
