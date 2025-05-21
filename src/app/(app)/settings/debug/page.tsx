
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, AlertCircle } from "lucide-react";
import { savePanelSettings, loadPanelSettings } from '../actions';
import type { SavePanelSettingsState, PanelSettingsData } from '../types';
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

export default function DebugSettingsPage() {
  const [allLoadedSettings, setAllLoadedSettings] = useState<PanelSettingsData>(explicitDefaultPanelSettings);
  const [currentDebugMode, setCurrentDebugMode] = useState(explicitDefaultPanelSettings.debugMode);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(
    (prevState: SavePanelSettingsState, data: PanelSettingsData) => savePanelSettings(prevState, data),
    initialSaveState
  );

  useEffect(() => {
    console.log("[DebugSettingsPage] Component mounted. Fetching initial settings.");
    const fetchSettings = async () => {
      try {
        const result = await loadPanelSettings();
        console.log("[DebugSettingsPage] Initial settings loaded:", result);
        if (result && result.data) {
          setAllLoadedSettings(result.data);
          setCurrentDebugMode(result.data.debugMode ?? explicitDefaultPanelSettings.debugMode);
        } else if (result && result.message && result.status !== 'success') {
          toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        toast({ title: "Error Loading Settings", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
        console.error("Failed to load settings in Debug page:", e);
      }
    };
    fetchSettings();
  }, [toast]); // Runs once on mount

  useEffect(() => {
    const toastDuration = (allLoadedSettings.popup?.notificationDuration || 5) * 1000;
    console.log("[DebugSettingsPage] Form state updated after save:", formState);

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllLoadedSettings(formState.data);
        setCurrentDebugMode(formState.data.debugMode ?? explicitDefaultPanelSettings.debugMode);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: toastDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      if (formState.errors?.general) {
        description = formState.errors.general.join('; ');
      } else if (formState.errors?.debugMode) {
        description = formState.errors.debugMode.join('; ');
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: toastDuration,
      });
    }
  }, [formState, toast, allLoadedSettings.popup?.notificationDuration]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedData: PanelSettingsData = {
      ...allLoadedSettings,
      debugMode: currentDebugMode,
    };
    console.log("[DebugSettingsPage] handleFormSubmit: Submitting with data:", submittedData);
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  }, [allLoadedSettings, currentDebugMode, startTransitionForAction, formAction]);

  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Debug Settings" description="Configure global debugging options for DVPanel." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Global Debug Mode</CardTitle>
            <CardDescription>
              Enable or disable global debug mode. This will provide more verbose logging and access to debug tools across the panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {formState.errors?.general && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="global-debug-mode" className="text-base font-semibold">Enable Global Debug Mode</Label>
                <p className="text-sm text-muted-foreground">Show verbose logs, detailed error messages, and enable the debug overlay.</p>
              </div>
              <Switch
                id="global-debug-mode"
                checked={currentDebugMode}
                onCheckedChange={setCurrentDebugMode}
              />
            </div>
            {formState.errors?.debugMode && (
              <Alert variant="destructive">
                <AlertDescription>{formState.errors.debugMode.join('; ')}</AlertDescription>
              </Alert>
            )}
             <p className="text-sm text-muted-foreground pt-4">
              Note: User-specific debug preferences have been removed. This setting now controls debug behavior for all users.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Debug Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
