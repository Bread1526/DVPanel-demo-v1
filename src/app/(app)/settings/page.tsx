
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from './actions';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
};

const defaultPanelSettingsData: PanelSettingsData = {
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

export default function PanelSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultPanelSettingsData);
  
  const [currentPanelPort, setCurrentPanelPort] = useState(defaultPanelSettingsData.panelPort);
  const [currentPanelIp, setCurrentPanelIp] = useState(defaultPanelSettingsData.panelIp);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition(); 
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      if (typeof window !== 'undefined') console.log("[PanelSettingsPage] useEffect: Calling loadPanelSettings");
      try {
        const result = await loadPanelSettings();
        if (typeof window !== 'undefined') console.log("[PanelSettingsPage] useEffect: loadPanelSettings result:", result);
        if (result && result.data) { // Added check for result itself
          setAllSettings(result.data);
          setCurrentPanelPort(result.data.panelPort);
          setCurrentPanelIp(result.data.panelIp || "");
        } else if (result && result.message && result.status !== 'success'){
           toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch (e) {
         toast({ title: "Error Loading Settings", description: "An unexpected error occurred.", variant: "destructive" });
         console.error("Failed to load settings in Panel page:", e);
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
        setCurrentPanelPort(formState.data.panelPort);
        setCurrentPanelIp(formState.data.panelIp || "");
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
      } else if (formState.errors && formState.errors.panelPort) {
        description = formState.errors.panelPort.join('; ');
      } else if (formState.errors && formState.errors.panelIp) {
        description = formState.errors.panelIp.join('; ');
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration, 
        errorContent: formState.errors?.general?.join('; ') || Object.values(formState.errors || {}).flat().join('; ')
      });
    }
  }, [formState, allSettings.popup?.notificationDuration, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window !== 'undefined') console.log("[PanelSettingsPage] handleFormSubmit: currentPanelPort", currentPanelPort, "currentPanelIp", currentPanelIp);
    
    const submittedData: PanelSettingsData = {
      ...allSettings,
      panelPort: currentPanelPort, 
      panelIp: currentPanelIp,     
    };
    if (typeof window !== 'undefined') console.log("[PanelSettingsPage] handleFormSubmit: Submitting with data:", submittedData);
    
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
                <AlertDescription>{formState.errors.panelIp.join(', ')}</AlertDescription>
              </Alert>
            )}
            {formState.errors?.general && (
              <Alert variant="destructive" className="md:col-span-3">
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
