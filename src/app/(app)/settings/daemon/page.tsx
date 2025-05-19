
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react'; 
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings } from '../actions';
import type { SavePanelSettingsState, PanelSettingsData, LoadPanelSettingsState } from '../types';
import { useToast } from "@/hooks/use-toast";
import { explicitDefaultPanelSettings } from '../types';
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
  isPending: false,
};

export default function DaemonSettingsPage() {
  const [allLoadedSettings, setAllLoadedSettings] = useState<PanelSettingsData>(explicitDefaultPanelSettings);
  
  const [currentDaemonPort, setCurrentDaemonPort] = useState(explicitDefaultPanelSettings.daemonPort);
  const [currentDaemonIp, setCurrentDaemonIp] = useState(explicitDefaultPanelSettings.daemonIp);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction, isActionStatePending] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result: LoadPanelSettingsState = await loadPanelSettings();
        if (result && result.data) {
          setAllLoadedSettings(result.data);
          setCurrentDaemonPort(result.data.daemonPort ?? explicitDefaultPanelSettings.daemonPort);
          setCurrentDaemonIp(result.data.daemonIp ?? explicitDefaultPanelSettings.daemonIp);
        } else if (result && result.message && result.status !== 'success') {
            toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        toast({ title: "Error Loading Settings", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
        console.error("Failed to load settings in Daemon page:", e);
      }
    };
    fetchSettings();
  }, [toast]);

  useEffect(() => {
     const toastDuration = 5000; // Default duration if not in user settings

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllLoadedSettings(formState.data); // Update the complete settings state
        setCurrentDaemonPort(formState.data.daemonPort ?? explicitDefaultPanelSettings.daemonPort);
        setCurrentDaemonIp(formState.data.daemonIp ?? explicitDefaultPanelSettings.daemonIp);
      }
      toast({
        title: "Settings Update",
        description: formState.message, 
        duration: toastDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      if (formState.errors?.daemonPort) description = formState.errors.daemonPort.join('; ');
      else if (formState.errors?.daemonIp) description = formState.errors.daemonIp.join('; ');
      else if (formState.errors?.general) description = formState.errors.general.join('; ');
      
      toast({
        title: "Error Saving Settings",
        description: description, 
        variant: "destructive",
        duration: toastDuration,
      });
    }
  }, [formState, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allLoadedSettings, // Preserve other global settings
      daemonPort: currentDaemonPort, 
      daemonIp: currentDaemonIp,
    };
    
    startTransitionForAction(() => {
      formAction(submittedData); 
    });
  }, [allLoadedSettings, currentDaemonPort, currentDaemonIp, startTransitionForAction, formAction]);
  
  const isPending = isActionStatePending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Daemon Settings" description="Configure the backend daemon connection details." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Daemon Configuration</CardTitle>
            <CardDescription>These settings define how the panel attempts to connect to a separate daemon process.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="daemon-port">Daemon Port</Label>
              <Input 
                id="daemon-port" 
                type="number" 
                value={currentDaemonPort}
                onChange={(e) => setCurrentDaemonPort(e.target.value)}
                className="md:col-span-2" 
              />
            </div>
             {formState.errors?.daemonPort && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                <AlertDescription>{formState.errors.daemonPort.join(', ')}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <Label htmlFor="daemon-ip">Daemon IP/Domain</Label>
              <Input 
                id="daemon-ip" 
                placeholder="e.g., 127.0.0.1 or daemon.mypanel.example.com" 
                value={currentDaemonIp}
                onChange={(e) => setCurrentDaemonIp(e.target.value)}
                className="md:col-span-2" 
              />
            </div>
            {formState.errors?.daemonIp && (
              <Alert variant="destructive" className="md:col-span-3 md:ml-[calc(33.33%+1rem)]">
                <AlertDescription>{formState.errors.daemonIp.join(', ')}</AlertDescription>
              </Alert>
            )}
             {formState.errors?.general && (
              <Alert variant="destructive" className="md:col-span-3">
                <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-muted-foreground md:col-span-3 md:pl-[calc(33.33%+1rem)]">
              Warning: Ensure the panel can reach the daemon at this address. Mismatched IPs/domains or incorrect ports can cause connection issues with the daemon.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Daemon Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
