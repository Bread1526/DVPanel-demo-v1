
"use client";

import React, { useState, useEffect, useTransition } from 'react';
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
};

export default function PanelSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultPanelSettingsData);
  
  // Local state for this page's inputs
  const [currentPanelPort, setCurrentPanelPort] = useState(defaultPanelSettingsData.panelPort);
  const [currentPanelIp, setCurrentPanelIp] = useState(defaultPanelSettingsData.panelIp);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition(); 
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      console.log("[PanelSettingsPage] useEffect: Calling loadPanelSettings");
      const result = await loadPanelSettings();
      console.log("[PanelSettingsPage] useEffect: loadPanelSettings result:", result);
      if (result.data) {
        setAllSettings(result.data);
        setCurrentPanelPort(result.data.panelPort);
        setCurrentPanelIp(result.data.panelIp || "");
      }
      // Toast notifications for loading can be added here if desired
    };
    fetchSettings();
  }, []); 

  useEffect(() => {
    const toastDurationSource = formState.data?.popup?.notificationDuration ?? allSettings.popup.notificationDuration;
    const effectiveDuration = toastDurationSource * 1000;

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllSettings(formState.data); // Update the full settings state
        setCurrentPanelPort(formState.data.panelPort);
        setCurrentPanelIp(formState.data.panelIp || "");
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      // ... error toast logic ...
       let description = formState.message;
      if (formState.errors?.general) {
        description = formState.errors.general; 
      } else if (formState.errors && Object.keys(formState.errors).length > 0 && formState.errors.panelPort) {
        description = "Validation failed for Panel Port. Please check the field.";
      } else if (formState.errors && Object.keys(formState.errors).length > 0 && formState.errors.panelIp) {
        description = "Validation failed for Panel IP/Domain. Please check the field.";
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration, 
        errorContent: formState.errors?.general || Object.values(formState.errors || {}).flat().join('; ')
      });
    }
  }, [formState, allSettings.popup.notificationDuration]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings, // Base with all loaded settings
      panelPort: currentPanelPort, // Override with current page's state
      panelIp: currentPanelIp,     // Override with current page's state
    };
    console.log("[PanelSettingsPage] handleFormSubmit: Submitting with data:", submittedData);
    
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  };
  
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
                name="panel-port" 
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
                name="panel-ip"
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
                <AlertDescription>{formState.errors.general}</AlertDescription>
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
