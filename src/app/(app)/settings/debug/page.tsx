
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react'; 
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, Info, AlertTriangle } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from '../actions';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

export default function DebugSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  const [currentDebugMode, setCurrentDebugMode] = useState(defaultSettingsData.debugMode);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await loadPanelSettings();
        if (result && result.data) { // Added check for result itself
          setAllSettings(result.data);
          setCurrentDebugMode(result.data.debugMode ?? defaultSettingsData.debugMode);
        } else if (result && result.message && result.status !== 'success') {
           toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch(e) {
          toast({ title: "Error Loading Settings", description: "An unexpected error occurred.", variant: "destructive" });
          console.error("Failed to load settings in Debug page:", e);
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
        setCurrentDebugMode(formState.data.debugMode ?? defaultSettingsData.debugMode);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = "Validation failed for Debug settings. Please check the fields.";
      if (formState.errors?.general?.length) {
        description = formState.errors.general.join('; ');
      } else if (formState.errors?.debugMode) {
        description = formState.errors.debugMode.join('; ') || description;
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration,
        errorContent: formState.errors?.general?.join('; ') || (formState.errors?.debugMode || []).join('; ')
      });
    }
  }, [formState, allSettings.popup?.notificationDuration, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings, 
      debugMode: currentDebugMode, 
    };
    
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  }, [allSettings, currentDebugMode, startTransitionForAction, formAction]);

  const handleTestDefaultPopup = useCallback(() => {
    toast({
      title: "Test Default Popup",
      description: "This is a test informational notification!",
      duration: (allSettings.popup?.notificationDuration ?? 5) * 1000,
    });
  }, [toast, allSettings.popup?.notificationDuration]);

  const handleTestErrorPopup = useCallback(() => {
    try {
      throw new Error("This is a simulated console error for testing purposes.");
    } catch (e: any) {
      console.error("Simulated Error:", e.message);
      const errorDetails = allSettings.popup?.showConsoleErrorsInNotifications && currentDebugMode 
                           ? `Console: ${e.message}` 
                           : "This is a test error notification!";
      toast({
        title: "Test Error Popup",
        description: errorDetails,
        variant: "destructive",
        duration: (allSettings.popup?.notificationDuration ?? 5) * 1000,
        errorContent: `Error: ${e.message}\nStack: ${e.stack}`,
      });
    }
  }, [toast, allSettings.popup?.notificationDuration, allSettings.popup?.showConsoleErrorsInNotifications, currentDebugMode]);
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Debug Settings" description="Configure debugging features and test functionalities." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Debugging Configuration</CardTitle>
            <CardDescription>Settings are encrypted.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="debug-mode-switch" className="text-base font-semibold">Enable Debug Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Enable verbose logging and additional debugging information in UI notifications.
                </p>
              </div>
              <Switch 
                id="debug-mode-switch" 
                name="debugMode"
                checked={currentDebugMode}
                onCheckedChange={setCurrentDebugMode}
              />
            </div>
            {formState.errors?.debugMode && (
              <Alert variant="destructive">
                <AlertDescription>{formState.errors.debugMode.join(', ')}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2 pt-4 border-t">
              <h4 className="text-md font-semibold">Test Notifications</h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={handleTestDefaultPopup} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  <Info className="mr-2 h-4 w-4" /> Test Default Popup
                </Button>
                <Button type="button" variant="destructive" onClick={handleTestErrorPopup} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  <AlertTriangle className="mr-2 h-4 w-4" /> Test Error Popup
                </Button>
              </div>
            </div>
            {formState.errors?.general && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Debug Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
