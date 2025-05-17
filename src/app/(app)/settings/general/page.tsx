
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react'; 
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

const defaultSettingsData: PanelSettingsData = {
  panelPort: "27407",
  panelIp: "",
  sessionInactivityTimeout: 30,
  disableAutoLogoutOnInactivity: false,
};

export default function GeneralSettingsPage() {
  // This state holds ALL global settings loaded, even if this page doesn't edit all of them
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  // savePanelSettings currently handles panelPort, panelIp, and session settings.
  // This page is a placeholder for now.
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);


  const fetchSettings = useCallback(async () => {
    try {
      const result = await loadPanelSettings();
      if (result && result.data) { 
        setAllSettings(result.data);
      } else if (result && result.message && result.status !== 'success') {
          toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      toast({ title: "Error Loading Settings", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
      console.error("Failed to load settings in General page:", e);
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
  }, [formState, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Since this page has no specific inputs yet, submitting from here would just re-save existing settings.
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
            <CardDescription>
              (This section is a placeholder. Functionality like changing owner credentials will be added later.)
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
             {formState.errors?.general && (
                <Alert variant="destructive" className="md:col-span-3">
                    <AlertTitle>Form Error</AlertTitle>
                    <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
                </Alert>
            )}
            <p className="text-muted-foreground">
              This section will allow management of core panel settings. Currently, owner credentials are managed via `.env.local`.
            </p>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending || true /* Disable until this page has editable fields */}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save General Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
