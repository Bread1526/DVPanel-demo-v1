
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react'; 
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2, AlertCircle } from "lucide-react";
import { savePanelSettings, loadPanelSettings } from '../actions';
import type { SavePanelSettingsState, PanelSettingsData } from '../types';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Added AlertTitle

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
  isPending: false,
};

// Used for initializing local state and as a fallback.
const defaultSettingsData: PanelSettingsData = {
  panelPort: "27407", 
  panelIp: "",
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
  // Daemon specific fields would go here if they were part of PanelSettingsData
  // For now, they are not, so this form is mostly a placeholder.
};

export default function DaemonSettingsPage() {
  // This state holds ALL global settings loaded, even if this page only edits a subset (or none yet)
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  // Local state for fields managed by THIS page (currently none for daemon)
  // const [currentDaemonPort, setCurrentDaemonPort] = useState("8443"); // Example if we add daemon settings
  // const [currentDaemonIp, setCurrentDaemonIp] = useState("");

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  // The savePanelSettings action currently saves Panel Port and IP.
  // If Daemon settings were separate, they'd need their own action or an extended PanelSettingsData.
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);


  const fetchSettings = useCallback(async () => {
    try {
      const result = await loadPanelSettings();
      if (result && result.data) { 
        setAllSettings(result.data);
        // Populate daemon-specific state if these fields were part of result.data
        // e.g., setCurrentDaemonPort(result.data.daemonPort || "8443");
      } else if (result && result.message && result.status !== 'success') {
          toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      toast({ title: "Error Loading Settings", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
      console.error("Failed to load settings in Daemon page:", e);
    }
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
     const effectiveDuration = 5000; 

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllSettings(formState.data); 
        // Update daemon-specific local state if necessary
      }
      toast({
        title: "Settings Update",
        description: formState.message, 
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      // Check for specific field errors if this form had any
      // if (formState.errors?.daemonPort) { description = formState.errors.daemonPort.join('; '); } 
      toast({
        title: "Error Saving Settings",
        description: description, 
        variant: "destructive",
        duration: effectiveDuration,
      });
    }
  }, [formState, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Construct the full settings object to send to the action
    // Since daemon settings are not yet part of PanelSettingsData,
    // this submission will effectively only re-save existing global settings.
    const submittedData: PanelSettingsData = {
      ...allSettings, 
      // daemonPort: currentDaemonPort, // Add if these fields become part of PanelSettingsData
      // daemonIp: currentDaemonIp,
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  }, [allSettings, /* currentDaemonPort, currentDaemonIp, */ startTransitionForAction, formAction]);
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Daemon Settings" description="Configure the backend daemon connection details." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Daemon Configuration</CardTitle>
            <CardDescription>
              (Functionality to save separate daemon settings is pending. Current save button will re-save general panel settings.)
            </CardDescription>
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
              <Label htmlFor="daemon-port">Daemon Port</Label>
              <Input id="daemon-port" type="number" defaultValue="8443" className="md:col-span-2" disabled />
            </div>
            {/* Example for future:
            {formState.errors?.daemonPort && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                 <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{(formState.errors.daemonPort as string[]).join(', ')}</AlertDescription>
              </Alert>
            )}
            */}
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="daemon-ip">Daemon IP/Domain</Label>
              <Input id="daemon-ip" placeholder="e.g., 127.0.0.1 or daemon.mypanel.example.com" className="md:col-span-2" disabled />
            </div>
             {formState.errors?.general && (
                <Alert variant="destructive" className="md:col-span-3">
                    <AlertTitle>Form Error</AlertTitle>
                    <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
                </Alert>
            )}
            <p className="text-sm text-muted-foreground md:col-span-3 md:pl-[calc(33.33%+1rem)]">
              Warning: Ensure the panel can reach the daemon at this address. Mismatched IPs/domains can cause connection issues.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending || true /* Disable until daemon settings are part of save action */}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Daemon Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
