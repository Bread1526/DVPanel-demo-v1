
"use client";

import React, { useState, useEffect } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2, Settings as SettingsIcon, SlidersHorizontal, Shield, MessageSquareMore, Info } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from './actions';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
};

const defaultPopupSettings = {
  notificationDuration: 5,
  disableAllNotifications: false,
  disableAutoClose: false,
  enableCopyError: false,
  showConsoleErrorsInNotifications: false,
};

export default function SettingsPage() {
  const [currentPanelPort, setCurrentPanelPort] = useState("27407");
  const [currentPanelIp, setCurrentPanelIp] = useState("");
  const [currentDebugMode, setCurrentDebugMode] = useState(false);
  
  // Popup settings state
  const [currentNotificationDuration, setCurrentNotificationDuration] = useState(defaultPopupSettings.notificationDuration);
  const [currentDisableAllNotifications, setCurrentDisableAllNotifications] = useState(defaultPopupSettings.disableAllNotifications);
  const [currentDisableAutoClose, setCurrentDisableAutoClose] = useState(defaultPopupSettings.disableAutoClose);
  const [currentEnableCopyError, setCurrentEnableCopyError] = useState(defaultPopupSettings.enableCopyError);
  const [currentShowConsoleErrors, setCurrentShowConsoleErrors] = useState(defaultPopupSettings.showConsoleErrorsInNotifications);

  const { toast } = useToast();

  const updateLocalState = (data?: PanelSettingsData) => {
    if (data) {
      setCurrentPanelPort(data.panelPort);
      setCurrentPanelIp(data.panelIp);
      setCurrentDebugMode(data.debugMode);
      setCurrentNotificationDuration(data.popup?.notificationDuration ?? defaultPopupSettings.notificationDuration);
      setCurrentDisableAllNotifications(data.popup?.disableAllNotifications ?? defaultPopupSettings.disableAllNotifications);
      setCurrentDisableAutoClose(data.popup?.disableAutoClose ?? defaultPopupSettings.disableAutoClose);
      setCurrentEnableCopyError(data.popup?.enableCopyError ?? defaultPopupSettings.enableCopyError);
      setCurrentShowConsoleErrors(data.popup?.showConsoleErrorsInNotifications ?? defaultPopupSettings.showConsoleErrorsInNotifications);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      updateLocalState(result.data);
      if (result.status === 'success') {
        toast({
          title: "Settings Loaded",
          description: `Panel settings loaded successfully${result.data?.debugMode && result.message ? `. ${result.message}` : result.data?.debugMode ? '.' : ''}`,
          duration: result.data?.popup?.notificationDuration ? result.data.popup.notificationDuration * 1000 : 5000,
        });
      } else if (result.status === 'not_found') {
        toast({
          title: "Settings Info",
          description: result.message || "No existing settings found. Using defaults.",
          variant: "default",
          duration: result.data?.popup?.notificationDuration ? result.data.popup.notificationDuration * 1000 : 5000,
        });
      } else if (result.status === 'error') {
        toast({
          title: "Error Loading Settings",
          description: result.message || "Could not load panel settings.",
          variant: "destructive",
          duration: result.data?.popup?.notificationDuration ? result.data.popup.notificationDuration * 1000 : 5000,
        });
      }
    };
    fetchSettings();
  }, [toast]);

  const [formState, formAction, isPending] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    if (formState.status === "success" && formState.message) {
      updateLocalState(formState.data);
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: formState.data?.popup?.notificationDuration ? formState.data.popup.notificationDuration * 1000 : 5000,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      // Simplified error display, can be expanded if needed
      if (formState.errors?.general) {
        description = formState.errors.general; 
      } else if (formState.errors) {
        description = "Validation failed. Please check the form fields.";
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: currentNotificationDuration * 1000, // Use current state for duration on error
      });
    }
  }, [formState, toast, currentNotificationDuration]);
  
  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Ensure switch values are correctly represented in FormData if not already
    if (!formData.has('debug-mode')) formData.set('debug-mode', currentDebugMode ? 'on' : ''); // Off is empty or not present
    if (!formData.has('popup-disable-all')) formData.set('popup-disable-all', currentDisableAllNotifications ? 'on' : '');
    if (!formData.has('popup-disable-autoclose')) formData.set('popup-disable-autoclose', currentDisableAutoClose ? 'on' : '');
    if (!formData.has('popup-enable-copy')) formData.set('popup-enable-copy', currentEnableCopyError ? 'on' : '');
    if (!formData.has('popup-show-console-errors')) formData.set('popup-show-console-errors', currentShowConsoleErrors ? 'on' : '');
    
    formAction(formData);
  };


  return (
    <div>
      <PageHeader 
        title="Settings" 
        description="Configure panel, daemon, security, popups, and general application settings."
      />

      <Tabs defaultValue="panel" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="panel">
            <SlidersHorizontal className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Panel
          </TabsTrigger>
          <TabsTrigger value="daemon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4 md:hidden lg:inline-block"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19 12h2"/><path d="M3 12h2"/><path d="M12 5V3"/><path d="M12 21v-2"/></svg>
            Daemon
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Security
          </TabsTrigger>
          <TabsTrigger value="popups">
            <MessageSquareMore className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Popups
          </TabsTrigger>
          <TabsTrigger value="general">
            <SettingsIcon className="mr-2 h-4 w-4 md:hidden lg:inline-block" />General
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleFormSubmit}>
          {/* Hidden inputs to carry over settings from other tabs if form is unified */}
          <input type="hidden" name="panel-port" value={currentPanelPort} />
          <input type="hidden" name="panel-ip" value={currentPanelIp} />
          {/* General tab's debug mode is submitted by its own switch name */}
          {/* Popup settings are submitted by their own input names */}


          <TabsContent value="panel">
            <Card>
              <CardHeader>
                <CardTitle>Panel Settings</CardTitle>
                <CardDescription>Customize how your DVPanel is accessed and operates.</CardDescription>
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
                    placeholder="e.g., 0.0.0.0 or mypanel.example.com" 
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
                  If using a domain, ensure your reverse proxy (e.g., Nginx) is configured correctly to forward requests to the panel port. Changes require a panel restart to take effect.
                </p>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isPending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Panel Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="daemon">
            <Card>
              <CardHeader>
                <CardTitle>Daemon Settings</CardTitle>
                <CardDescription>Configure the backend daemon connection details. (Functionality pending)</CardDescription>
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
                <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
                  <Save className="mr-2 h-4 w-4"/> Save Daemon Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Enhance your panel's security posture. (Functionality pending)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div>
                  <Label className="text-base font-semibold">IP Whitelisting</Label>
                  <p className="text-sm text-muted-foreground mb-2">Allow access only from specific IP addresses for selected ports.</p>
                  <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>Manage IP Whitelist</Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="2fa" className="text-base font-semibold">Two-Factor Authentication (2FA)</Label>
                    <p className="text-sm text-muted-foreground">Require a second form of verification for logins.</p>
                  </div>
                  <Switch id="2fa" disabled />
                </div>

                <div>
                  <Label className="text-base font-semibold">Rate Limiting</Label>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Login Attempts</p>
                      <Switch id="rate-limit-login" defaultChecked disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm">API Usage</p>
                      <Switch id="rate-limit-api" disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm">Project Start/Stop Actions</p>
                      <Switch id="rate-limit-project" defaultChecked disabled />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled={isPending}>
                  <Save className="mr-2 h-4 w-4"/> Save Security Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="popups">
            <Card>
              <CardHeader>
                <CardTitle>Popup Notification Settings</CardTitle>
                <CardDescription>Customize how notifications (toasts) behave.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="popup-duration">Notification Duration (seconds)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      id="popup-duration-slider"
                      name="popup-duration" // Name for form submission
                      min={2} max={15} step={1}
                      value={[currentNotificationDuration]}
                      onValueChange={(value) => setCurrentNotificationDuration(value[0])}
                      className="flex-grow"
                    />
                    <Input
                      id="popup-duration-input"
                      name="popup-duration" // Duplicate name is fine, slider value will likely be used
                      type="number"
                      value={currentNotificationDuration}
                      onChange={(e) => setCurrentNotificationDuration(parseInt(e.target.value, 10))}
                      min={2} max={15}
                      className="w-20"
                    />
                  </div>
                  {formState.errors?.popup?.notificationDuration && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertDescription>{formState.errors.popup.notificationDuration.join(', ')}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="popup-disable-all" className="text-base font-semibold">Disable All Notifications</Label>
                    <p className="text-sm text-muted-foreground">Completely turn off popup notifications. (Debug mode may override this)</p>
                  </div>
                  <Switch 
                    id="popup-disable-all"
                    name="popup-disable-all"
                    checked={currentDisableAllNotifications}
                    onCheckedChange={setCurrentDisableAllNotifications}
                  />
                </div>
                {formState.errors?.popup?.disableAllNotifications && (
                  <Alert variant="destructive"><AlertDescription>{formState.errors.popup.disableAllNotifications.join(', ')}</AlertDescription></Alert>
                )}

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="popup-disable-autoclose" className="text-base font-semibold">Disable Auto-Closing Notifications</Label>
                    <p className="text-sm text-muted-foreground">Notifications will stay until manually closed. (Debug mode may override this)</p>
                  </div>
                  <Switch
                    id="popup-disable-autoclose"
                    name="popup-disable-autoclose"
                    checked={currentDisableAutoClose}
                    onCheckedChange={setCurrentDisableAutoClose}
                  />
                </div>
                 {formState.errors?.popup?.disableAutoClose && (
                  <Alert variant="destructive"><AlertDescription>{formState.errors.popup.disableAutoClose.join(', ')}</AlertDescription></Alert>
                )}

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="popup-enable-copy" className="text-base font-semibold">Enable 'Copy Error' Button</Label>
                    <p className="text-sm text-muted-foreground">Show a button on error notifications to copy details to clipboard.</p>
                  </div>
                  <Switch
                    id="popup-enable-copy"
                    name="popup-enable-copy"
                    checked={currentEnableCopyError}
                    onCheckedChange={setCurrentEnableCopyError}
                  />
                </div>
                {formState.errors?.popup?.enableCopyError && (
                  <Alert variant="destructive"><AlertDescription>{formState.errors.popup.enableCopyError.join(', ')}</AlertDescription></Alert>
                )}
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="popup-show-console-errors" className="text-base font-semibold">Show Console Errors in Notifications (Debug Only)</Label>
                    <p className="text-sm text-muted-foreground">If Debug Mode is active, include console error details in notifications.</p>
                  </div>
                  <Switch
                    id="popup-show-console-errors"
                    name="popup-show-console-errors"
                    checked={currentShowConsoleErrors}
                    onCheckedChange={setCurrentShowConsoleErrors}
                  />
                </div>
                {formState.errors?.popup?.showConsoleErrorsInNotifications && (
                  <Alert variant="destructive"><AlertDescription>{formState.errors.popup.showConsoleErrorsInNotifications.join(', ')}</AlertDescription></Alert>
                )}
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isPending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Popup Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Application Settings</CardTitle>
                <CardDescription>Configure general behavior and preferences for DVPanel.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="debug-mode" className="text-base font-semibold">Debug Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable verbose logging and additional debugging information in UI notifications.
                    </p>
                  </div>
                  <Switch 
                    id="debug-mode" 
                    name="debug-mode"
                    checked={currentDebugMode}
                    onCheckedChange={setCurrentDebugMode}
                  />
                </div>
                 {formState.errors?.debugMode && (
                  <Alert variant="destructive">
                    <AlertDescription>{formState.errors.debugMode.join(', ')}</AlertDescription>
                  </Alert>
                )}
                {formState.errors?.general && (
                  <Alert variant="destructive">
                    <AlertDescription>{formState.errors.general}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isPending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save General Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </form>
      </Tabs>
    </div>
  );
}
