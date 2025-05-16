
"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { useActionState } from 'react'; // Corrected import
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from '../actions';
import { useToast } from "@/hooks/use-toast";
// import { Alert, AlertDescription } from "@/components/ui/alert"; // Uncomment if error display is needed

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

export default function DaemonSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  // Add state for daemon-specific inputs if any in the future
  // const [currentDaemonPort, setCurrentDaemonPort] = useState("8443"); 
  // const [currentDaemonIp, setCurrentDaemonIp] = useState("");

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState); // Changed to useActionState

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      if (result.data) {
        setAllSettings(result.data);
        // Populate daemon-specific state if any
        // setCurrentDaemonPort(result.data.daemon?.port ?? "8443");
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
        // Update daemon-specific state if any
      }
      toast({
        title: "Settings Update",
        description: formState.message, // This will show "Panel settings saved successfully" for now
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      toast({
        title: "Error Saving Settings",
        description: formState.message, // Or more specific error based on formState.errors
        variant: "destructive",
        duration: effectiveDuration,
      });
    }
  }, [formState, allSettings.popup.notificationDuration, toast]); // Added toast to dependency array

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Construct submittedData including daemon settings if they existed in PanelSettingsData
    const submittedData: PanelSettingsData = {
      ...allSettings, // Start with all current settings
      // Overwrite with values from this page if they existed
      // daemon: { 
      //   port: currentDaemonPort,
      //   ip: currentDaemonIp,
      // },
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  };
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Daemon Settings" description="Configure the backend daemon connection details." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Daemon Configuration</CardTitle>
            <CardDescription>(Functionality pending for separate daemon settings saving)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="daemon-port">Daemon Port</Label>
              <Input id="daemon-port" type="number" defaultValue="8443" className="md:col-span-2" disabled />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="daemon-ip">Daemon IP/Domain</Label>
              <Input id="daemon-ip" placeholder="e.g., 127.0.0.1 or daemon.mypanel.example.com" className="md:col-span-2" disabled />
            </div>
            <p className="text-sm text-destructive md:col-span-3 md:pl-[calc(33.33%+1rem)]">
              Warning: Ensure the panel can reach the daemon at this address. Mismatched IPs/domains can cause connection issues.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Daemon Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
