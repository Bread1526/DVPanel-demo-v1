
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react'; 
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function DaemonSettingsPage() {
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
        console.error("Failed to load settings in Daemon page:", e);
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
