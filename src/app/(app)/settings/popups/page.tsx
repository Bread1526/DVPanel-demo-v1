
"use client";

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useActionState } from 'react'; 
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Save, Loader2 } from "lucide-react";
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

export default function PopupsSettingsPage() {
  const [allSettings, setAllSettings] = useState<PanelSettingsData>(defaultSettingsData);
  
  const [currentNotificationDuration, setCurrentNotificationDuration] = useState(defaultSettingsData.popup.notificationDuration);
  const [currentDisableAllNotifications, setCurrentDisableAllNotifications] = useState(defaultSettingsData.popup.disableAllNotifications);
  const [currentDisableAutoClose, setCurrentDisableAutoClose] = useState(defaultSettingsData.popup.disableAutoClose);
  const [currentEnableCopyError, setCurrentEnableCopyError] = useState(defaultSettingsData.popup.enableCopyError);
  const [currentShowConsoleErrors, setCurrentShowConsoleErrors] = useState(defaultSettingsData.popup.showConsoleErrorsInNotifications);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition();
  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await loadPanelSettings();
        if (result && result.data) { // Added check for result itself
          setAllSettings(result.data);
          const popupDefaults = defaultSettingsData.popup;
          const loadedPopupSettings = result.data.popup || popupDefaults;
          setCurrentNotificationDuration(loadedPopupSettings.notificationDuration ?? popupDefaults.notificationDuration);
          setCurrentDisableAllNotifications(loadedPopupSettings.disableAllNotifications ?? popupDefaults.disableAllNotifications);
          setCurrentDisableAutoClose(loadedPopupSettings.disableAutoClose ?? popupDefaults.disableAutoClose);
          setCurrentEnableCopyError(loadedPopupSettings.enableCopyError ?? popupDefaults.enableCopyError);
          setCurrentShowConsoleErrors(loadedPopupSettings.showConsoleErrorsInNotifications ?? popupDefaults.showConsoleErrorsInNotifications);
        } else if (result && result.message && result.status !== 'success') {
          toast({ title: "Error Loading Settings", description: result.message, variant: "destructive" });
        }
      } catch(e) {
        toast({ title: "Error Loading Settings", description: "An unexpected error occurred.", variant: "destructive" });
        console.error("Failed to load settings in Popups page:", e);
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
        const popupDefaults = defaultSettingsData.popup;
        const newPopupSettings = formState.data.popup || popupDefaults;
        setCurrentNotificationDuration(newPopupSettings.notificationDuration ?? popupDefaults.notificationDuration);
        setCurrentDisableAllNotifications(newPopupSettings.disableAllNotifications ?? popupDefaults.disableAllNotifications);
        setCurrentDisableAutoClose(newPopupSettings.disableAutoClose ?? popupDefaults.disableAutoClose);
        setCurrentEnableCopyError(newPopupSettings.enableCopyError ?? popupDefaults.enableCopyError);
        setCurrentShowConsoleErrors(newPopupSettings.showConsoleErrorsInNotifications ?? popupDefaults.showConsoleErrorsInNotifications);
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = "Validation failed for Popup settings. Please check the fields.";
       if (formState.errors?.general?.length) { // Use .length for arrays
        description = formState.errors.general.join('; ');
      } else if (formState.errors?.popup) {
         description = Object.values(formState.errors.popup).flat().join('; ') || description;
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration,
        errorContent: formState.errors?.general?.join('; ') || Object.values(formState.errors?.popup || {}).flat().join('; ')
      });
    }
  }, [formState, allSettings.popup?.notificationDuration, toast]);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      ...allSettings, 
      popup: { 
        notificationDuration: currentNotificationDuration,
        disableAllNotifications: currentDisableAllNotifications,
        disableAutoClose: currentDisableAutoClose,
        enableCopyError: currentEnableCopyError,
        showConsoleErrorsInNotifications: currentShowConsoleErrors,
      }
    };
    
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  }, [allSettings, currentNotificationDuration, currentDisableAllNotifications, currentDisableAutoClose, currentEnableCopyError, currentShowConsoleErrors, startTransitionForAction, formAction]);
  
  const isPending = formState.isPending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader title="Popup Settings" description="Customize how notifications (toasts) behave." />
      <form onSubmit={handleFormSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Popup Notification Configuration</CardTitle>
            <CardDescription>Settings are encrypted and affect all users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-2">
              <Label htmlFor="popup-duration-slider">Notification Duration (seconds)</Label>
              <div className="flex items-center gap-4">
                <Slider
                  id="popup-duration-slider"
                  name="notificationDuration" 
                  min={2} max={15} step={1}
                  value={[currentNotificationDuration]}
                  onValueChange={(value) => setCurrentNotificationDuration(value[0])}
                  className="flex-grow"
                />
                <Input
                  id="popup-duration-input"
                  type="number"
                  value={currentNotificationDuration}
                  onChange={(e) => setCurrentNotificationDuration(parseInt(e.target.value, 10))}
                  min={2} max={15}
                  className="w-20"
                />
              </div>
              {formState.errors?.["popup.notificationDuration"] && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{formState.errors["popup.notificationDuration"].join(', ')}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="popup-disable-all" className="text-base font-semibold">Disable All Notifications</Label>
                <p className="text-sm text-muted-foreground">Completely turn off popup notifications. (Debug mode may override this for critical errors)</p>
              </div>
              <Switch 
                id="popup-disable-all"
                name="disableAllNotifications"
                checked={currentDisableAllNotifications}
                onCheckedChange={setCurrentDisableAllNotifications}
              />
            </div>
            {formState.errors?.["popup.disableAllNotifications"] && (
              <Alert variant="destructive"><AlertDescription>{formState.errors["popup.disableAllNotifications"].join(', ')}</AlertDescription></Alert>
            )}

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="popup-disable-autoclose" className="text-base font-semibold">Disable Auto-Closing Notifications</Label>
                <p className="text-sm text-muted-foreground">Notifications will stay until manually closed.</p>
              </div>
              <Switch
                id="popup-disable-autoclose"
                name="disableAutoClose"
                checked={currentDisableAutoClose}
                onCheckedChange={setCurrentDisableAutoClose}
              />
            </div>
            {formState.errors?.["popup.disableAutoClose"] && (
              <Alert variant="destructive"><AlertDescription>{formState.errors["popup.disableAutoClose"].join(', ')}</AlertDescription></Alert>
            )}

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="popup-enable-copy" className="text-base font-semibold">Enable 'Copy Error' Button</Label>
                <p className="text-sm text-muted-foreground">Show a button on error notifications to copy details to clipboard.</p>
              </div>
              <Switch
                id="popup-enable-copy"
                name="enableCopyError"
                checked={currentEnableCopyError}
                onCheckedChange={setCurrentEnableCopyError}
              />
            </div>
            {formState.errors?.["popup.enableCopyError"] && (
              <Alert variant="destructive"><AlertDescription>{formState.errors["popup.enableCopyError"].join(', ')}</AlertDescription></Alert>
            )}
            
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="popup-show-console-errors" className="text-base font-semibold">Show Console Errors in Notifications</Label>
                <p className="text-sm text-muted-foreground">If Debug Mode is also active, include console error details in notifications.</p>
              </div>
              <Switch
                id="popup-show-console-errors"
                name="showConsoleErrorsInNotifications"
                checked={currentShowConsoleErrors}
                onCheckedChange={setCurrentShowConsoleErrors}
              />
            </div>
            {formState.errors?.["popup.showConsoleErrorsInNotifications"] && (
              <Alert variant="destructive"><AlertDescription>{formState.errors["popup.showConsoleErrorsInNotifications"].join(', ')}</AlertDescription></Alert>
            )}
             {formState.errors?.general && (
                <Alert variant="destructive" className="mt-4">
                    <AlertDescription>{formState.errors.general.join('; ')}</AlertDescription>
                </Alert>
            )}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isPending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Popup Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
