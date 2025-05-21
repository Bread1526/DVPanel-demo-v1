
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Save, Loader2, AlertCircle } from "lucide-react";
import { savePanelSettings, loadPanelSettings } from '../actions';
import type { SavePanelSettingsState, PanelSettingsData, PanelPopupSettingsData } from '../types';
import { useToast } from "@/hooks/use-toast";
import { explicitDefaultPanelSettings } from '../types';
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
};

export default function PopupsSettingsPage() {
  const [allLoadedSettings, setAllLoadedSettings] = useState<PanelSettingsData>(explicitDefaultPanelSettings);
  const [currentPopupSettings, setCurrentPopupSettings] = useState<PanelPopupSettingsData>(explicitDefaultPanelSettings.popup);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(
    (prevState: SavePanelSettingsState, data: PanelSettingsData) => savePanelSettings(prevState, data),
    initialSaveState
  );

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await loadPanelSettings();
        if (result && result.data) {
          setAllLoadedSettings(result.data);
          setCurrentPopupSettings(result.data.popup ?? explicitDefaultPanelSettings.popup);
        } else if (result && result.message && result.status !== 'success') {
            toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        toast({ title: "Error Loading Settings", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
        console.error("Failed to load settings in Popups page:", e);
      }
    };
    fetchSettings();
  }, [toast]);

  useEffect(() => {
    const toastDuration = (currentPopupSettings.notificationDuration || 5) * 1000;

    if (formState.status === "success" && formState.message) {
      if (formState.data) {
        setAllLoadedSettings(formState.data);
        setCurrentPopupSettings(formState.data.popup ?? explicitDefaultPanelSettings.popup);
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
      } else if (formState.errors?.popup) {
        // Consider how to display nested popup errors if necessary
        description = "Error in popup settings. " + formState.message;
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: toastDuration,
      });
    }
  }, [formState, toast, currentPopupSettings.notificationDuration]);

  const handlePopupSettingChange = <K extends keyof PanelPopupSettingsData>(
    key: K,
    value: PanelPopupSettingsData[K]
  ) => {
    setCurrentPopupSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedData: PanelSettingsData = {
      ...allLoadedSettings,
      popup: currentPopupSettings,
    };
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  }, [allLoadedSettings, currentPopupSettings, startTransitionForAction, formAction]);

  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Popup Settings" description="Configure global popup notification preferences for DVPanel." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Global Notification Popups</CardTitle>
            <CardDescription>These settings affect all users of the panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {formState.errors?.general && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{formState.errors.general.join('; ')}</AlertDescription></Alert>
            )}
             {formState.errors?.popup && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Error in popup settings. Please check values.</AlertDescription></Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="global-popup-duration-slider">Notification Duration (seconds)</Label>
              <div className="flex items-center gap-4">
                <Slider
                  id="global-popup-duration-slider"
                  min={2} max={15} step={1}
                  value={[currentPopupSettings.notificationDuration]}
                  onValueChange={(value) => handlePopupSettingChange('notificationDuration', value[0])}
                  className="flex-grow"
                />
                <Input
                  type="number"
                  value={currentPopupSettings.notificationDuration}
                  onChange={(e) => handlePopupSettingChange('notificationDuration', parseInt(e.target.value, 10))}
                  min={2} max={15}
                  className="w-20"
                />
              </div>
              {formState.errors?.popup?.notificationDuration && <p className="text-xs text-destructive">{(formState.errors.popup.notificationDuration as string[]).join(', ')}</p>}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-md">
              <Label htmlFor="global-popup-disable-all" className="font-normal">Disable All Notifications</Label>
              <Switch id="global-popup-disable-all" checked={currentPopupSettings.disableAllNotifications} onCheckedChange={(checked) => handlePopupSettingChange('disableAllNotifications', checked)} />
            </div>
             {formState.errors?.popup?.disableAllNotifications && <p className="text-xs text-destructive">{(formState.errors.popup.disableAllNotifications as string[]).join(', ')}</p>}


            <div className="flex items-center justify-between p-3 border rounded-md">
              <Label htmlFor="global-popup-disable-autoclose" className="font-normal">Disable Auto-Closing Notifications</Label>
              <Switch id="global-popup-disable-autoclose" checked={currentPopupSettings.disableAutoClose} onCheckedChange={(checked) => handlePopupSettingChange('disableAutoClose', checked)} />
            </div>
            {formState.errors?.popup?.disableAutoClose && <p className="text-xs text-destructive">{(formState.errors.popup.disableAutoClose as string[]).join(', ')}</p>}

            <div className="flex items-center justify-between p-3 border rounded-md">
              <Label htmlFor="global-popup-enable-copy" className="font-normal">Enable 'Copy Error' Button on Error Popups</Label>
              <Switch id="global-popup-enable-copy" checked={currentPopupSettings.enableCopyError} onCheckedChange={(checked) => handlePopupSettingChange('enableCopyError', checked)} />
            </div>
            {formState.errors?.popup?.enableCopyError && <p className="text-xs text-destructive">{(formState.errors.popup.enableCopyError as string[]).join(', ')}</p>}

            <div className="flex items-center justify-between p-3 border rounded-md">
              <Label htmlFor="global-popup-show-console-errors" className="font-normal">Show Console Errors in Notifications (if Global Debug Mode is on)</Label>
              <Switch id="global-popup-show-console-errors" checked={currentPopupSettings.showConsoleErrorsInNotifications} onCheckedChange={(checked) => handlePopupSettingChange('showConsoleErrorsInNotifications', checked)} />
            </div>
            {formState.errors?.popup?.showConsoleErrorsInNotifications && <p className="text-xs text-destructive">{(formState.errors.popup.showConsoleErrorsInNotifications as string[]).join(', ')}</p>}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Popup Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
