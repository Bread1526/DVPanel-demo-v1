
"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import Image from 'next/image';
import { Save, Loader2, Settings as SettingsIcon, SlidersHorizontal, Shield, MessageSquareMore, Info, AlertTriangle, Bug, Link as LinkIcon, ExternalLink, Wifi, User, Users as UsersIcon, HardDrive } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState, type PanelSettingsData } from './actions';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
  errors: {},
  data: undefined,
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
  
  const [currentNotificationDuration, setCurrentNotificationDuration] = useState(defaultPopupSettings.notificationDuration);
  const [currentDisableAllNotifications, setCurrentDisableAllNotifications] = useState(defaultPopupSettings.disableAllNotifications);
  const [currentDisableAutoClose, setCurrentDisableAutoClose] = useState(defaultPopupSettings.disableAutoClose);
  const [currentEnableCopyError, setCurrentEnableCopyError] = useState(defaultPopupSettings.enableCopyError);
  const [currentShowConsoleErrors, setCurrentShowConsoleErrors] = useState(defaultPopupSettings.showConsoleErrorsInNotifications);

  const [latency, setLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const { toast } = useToast();
  const [isTransitionPendingForAction, startTransitionForAction] = useTransition(); 

  const updateLocalState = (data?: PanelSettingsData) => {
    if (data) {
      console.log("[SettingsPage] updateLocalState: Updating with data:", data);
      setCurrentPanelPort(data.panelPort);
      setCurrentPanelIp(data.panelIp || ""); 
      setCurrentDebugMode(data.debugMode ?? false);
      setCurrentNotificationDuration(data.popup?.notificationDuration ?? defaultPopupSettings.notificationDuration);
      setCurrentDisableAllNotifications(data.popup?.disableAllNotifications ?? defaultPopupSettings.disableAllNotifications);
      setCurrentDisableAutoClose(data.popup?.disableAutoClose ?? defaultPopupSettings.disableAutoClose);
      setCurrentEnableCopyError(data.popup?.enableCopyError ?? defaultPopupSettings.enableCopyError);
      setCurrentShowConsoleErrors(data.popup?.showConsoleErrorsInNotifications ?? defaultPopupSettings.showConsoleErrorsInNotifications);
    } else {
      console.log("[SettingsPage] updateLocalState: No data provided, state remains unchanged or uses initial defaults.");
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      console.log("[SettingsPage] useEffect: Calling loadPanelSettings");
      const result = await loadPanelSettings();
      console.log("[SettingsPage] useEffect: loadPanelSettings result:", result);
      updateLocalState(result.data);
      
      if (result.data?.popup) {
        localStorage.setItem('dvpanel-popup-settings', JSON.stringify(result.data.popup));
      }

      const effectiveDuration = result.data?.popup?.notificationDuration ? result.data.popup.notificationDuration * 1000 : 5000;
      const isDebug = result.data?.debugMode;

      if (result.status === 'success') {
        toast({
          title: "Settings Loaded",
          description: `Panel settings loaded successfully${isDebug && result.message ? `. ${result.message}` : isDebug ? '.' : ''}`,
          duration: effectiveDuration,
        });
      } else if (result.status === 'not_found') {
        toast({
          title: "Settings Info",
          description: result.message || "No existing settings found. Using defaults.",
          variant: "default",
          duration: effectiveDuration,
        });
      } else if (result.status === 'error') {
        toast({
          title: "Error Loading Settings",
          description: result.message || "Could not load panel settings.",
          variant: "destructive",
          duration: effectiveDuration,
        });
      }
    };
    fetchSettings();
  }, []); 

  const [formState, formAction] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    const toastDurationSource = formState.data?.popup?.notificationDuration ?? currentNotificationDuration;
    const effectiveDuration = toastDurationSource * 1000;

    if (formState.status === "success" && formState.message) {
      updateLocalState(formState.data); 
       if (formState.data?.popup) {
        localStorage.setItem('dvpanel-popup-settings', JSON.stringify(formState.data.popup));
      }
      toast({
        title: "Settings Update",
        description: formState.message,
        duration: effectiveDuration,
      });
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      if (formState.errors?.general) {
        description = formState.errors.general; 
      } else if (formState.errors && Object.keys(formState.errors).length > 0) {
        description = "Validation failed. Please check the form fields.";
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
        duration: effectiveDuration, 
        errorContent: formState.errors?.general || Object.values(formState.errors || {}).flat().join('; ')
      });
    }
  }, [formState, currentNotificationDuration]);

 const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const submittedData: PanelSettingsData = {
      panelPort: currentPanelPort,
      panelIp: currentPanelIp,
      debugMode: currentDebugMode,
      popup: {
        notificationDuration: currentNotificationDuration,
        disableAllNotifications: currentDisableAllNotifications,
        disableAutoClose: currentDisableAutoClose,
        enableCopyError: currentEnableCopyError,
        showConsoleErrorsInNotifications: currentShowConsoleErrors,
      }
    };
    console.log("[SettingsPage] handleFormSubmit: Submitting with data:", submittedData);
    
    startTransitionForAction(() => {
      formAction(submittedData);
    });
  };
  
  useEffect(() => {
    setIsPinging(true);
    const intervalId = setInterval(async () => {
      const startTime = Date.now();
      try {
        const response = await fetch('/api/ping');
        if (response.ok) {
          const endTime = Date.now();
          setLatency(endTime - startTime);
        } else {
          setLatency(null);
        }
      } catch (error) {
        setLatency(null);
      }
    }, 500);

    return () => {
      clearInterval(intervalId);
      setIsPinging(false);
    };
  }, []);


  const handleTestDefaultPopup = () => {
    toast({
      title: "Test Default Popup",
      description: "This is a test informational notification!",
      duration: currentNotificationDuration * 1000,
    });
  };

  const handleTestErrorPopup = () => {
    try {
      throw new Error("This is a simulated console error for testing purposes.");
    } catch (e: any) {
      console.error("Simulated Error:", e.message);
      const errorDetails = currentShowConsoleErrors && currentDebugMode ? `Console: ${e.message}` : "This is a test error notification!";
      toast({
        title: "Test Error Popup",
        description: errorDetails,
        variant: "destructive",
        duration: currentNotificationDuration * 1000,
        errorContent: `Error: ${e.message}\nStack: ${e.stack}`,
      });
    }
  };

  const isPending = isActionStatePending || isTransitionPendingForAction;

  return (
    <div>
      <PageHeader 
        title="Settings" 
        description="Configure panel, daemon, security, popups, debug and general application settings."
      />

      <Tabs defaultValue="panel" className="w-full">
        <div className="overflow-x-auto py-1 border-b border-border mb-2 whitespace-nowrap">
          <TabsList className="inline-flex h-10 items-center justify-start rounded-none border-none bg-transparent p-0 gap-1">
            <TabsTrigger value="panel">
              <SlidersHorizontal className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Panel
            </TabsTrigger>
            <TabsTrigger value="daemon">
              <HardDrive className="mr-2 h-4 w-4 md:hidden lg:inline-block" />
              Daemon
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Security
            </TabsTrigger>
            <TabsTrigger value="popups">
              <MessageSquareMore className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Popups
            </TabsTrigger>
            <TabsTrigger value="debug">
              <Bug className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Debug
            </TabsTrigger>
            <TabsTrigger value="general">
              <SettingsIcon className="mr-2 h-4 w-4 md:hidden lg:inline-block" />General
            </TabsTrigger>
            <TabsTrigger value="info">
              <Info className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Info
            </TabsTrigger>
          </TabsList>
        </div>

        <form onSubmit={handleFormSubmit}>
          <TabsContent value="panel" forceMount>
            <Card>
              <CardHeader>
                <CardTitle>Panel Settings</CardTitle>
                <CardDescription>Customize how your DVPanel is accessed and operates. Settings are encrypted.</CardDescription>
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

          <TabsContent value="daemon" forceMount>
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
                <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
                  <Save className="mr-2 h-4 w-4"/> Save Daemon Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="security" forceMount>
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
                <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
                  <Save className="mr-2 h-4 w-4"/> Save Security Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="popups" forceMount>
            <Card>
              <CardHeader>
                <CardTitle>Popup Notification Settings</CardTitle>
                <CardDescription>Customize how notifications (toasts) behave. Settings are encrypted.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="popup-duration-slider">Notification Duration (seconds)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      id="popup-duration-slider"
                      name="popup-duration" 
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
                  {formState.errors?.popup?.notificationDuration && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertDescription>{formState.errors.popup.notificationDuration.join(', ')}</AlertDescription>
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
                    <p className="text-sm text-muted-foreground">Notifications will stay until manually closed.</p>
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
                    <Label htmlFor="popup-show-console-errors" className="text-base font-semibold">Show Console Errors in Notifications</Label>
                    <p className="text-sm text-muted-foreground">If Debug Mode is also active, include console error details in notifications.</p>
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
          
          <TabsContent value="debug" forceMount>
            <Card>
              <CardHeader>
                <CardTitle>Debug Settings</CardTitle>
                <CardDescription>Configure debugging features and test functionalities. Settings are encrypted.</CardDescription>
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
                    <AlertDescription>{formState.errors.general}</AlertDescription>
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
          </TabsContent>

          <TabsContent value="general" forceMount>
            <Card>
              <CardHeader>
                <CardTitle>General Application Settings</CardTitle>
                <CardDescription>Configure general behavior and preferences for DVPanel. (Functionality pending)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <p className="text-muted-foreground">
                    General settings for panel administration, such as changing the panel owner username and password (encrypted), will be available here in a future update.
                  </p>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
                  <Save className="mr-2 h-4 w-4"/> Save General Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="info">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Info className="h-6 w-6 text-primary"/>DVPanel Information</CardTitle>
                <CardDescription>Details about DVPanel, resources, and credits.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <section>
                  <h3 className="text-lg font-semibold mb-3">Informational Links</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: "Sitemap", dialogContent: "Sitemap details will be available here." },
                      { label: "Terms of Service", dialogContent: "Terms of Service details will be available here." },
                      { label: "License", dialogContent: "License details (e.g., MIT, Apache 2.0) will be here." },
                      { label: "Privacy Policy", dialogContent: "Privacy Policy details will be available here." },
                    ].map(item => (
                      <Dialog key={item.label}>
                        <DialogTrigger asChild>
                          <Button variant="link" className="p-0 h-auto justify-start text-primary hover:underline">
                            <LinkIcon className="mr-2 h-4 w-4" />{item.label}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>{item.label}</DialogTitle>
                          </DialogHeader>
                          <DialogDescription className="py-4">
                            {item.dialogContent}
                          </DialogDescription>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button type="button" variant="secondary">Close</Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-3">External Resources</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Official Website", href: "https://dvpanel.com" },
                      { label: "Demo Pro Panel", href: "https://pro.demo.dvpanel.com" },
                      { label: "Free Demo Panel", href: "https://free.demo.dvpanel.com" },
                    ].map(link => (
                      <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline">
                        <ExternalLink className="mr-2 h-4 w-4" />{link.label}
                      </a>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-2">Panel Connectivity</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <Wifi className={`h-5 w-5 ${latency !== null ? 'text-green-500' : 'text-red-500'}`} />
                    <span>Ping to Panel:</span>
                    {isPinging && latency === null && <span className="text-muted-foreground">Pinging...</span>}
                    {latency !== null && <span className="font-semibold text-foreground">{latency} ms</span>}
                    {!isPinging && latency === null && <span className="text-red-500">Unavailable</span>}
                  </div>
                   <p className="text-xs text-muted-foreground mt-1">Latency to the server hosting this panel instance. Updates every 0.5 seconds.</p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-4">Credits</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="flex flex-col items-center text-center p-4 border rounded-lg shadow-sm">
                      <Image 
                        src="https://placehold.co/80x80.png" 
                        alt="Road.js" 
                        width={80} 
                        height={80} 
                        className="rounded-full mb-3"
                        data-ai-hint="male avatar" 
                      />
                      <h4 className="font-semibold text-foreground">Road.js</h4>
                      <p className="text-sm text-muted-foreground">Founder & Lead Developer</p>
                    </div>
                    <div className="flex flex-col items-center text-center p-4 border rounded-lg shadow-sm">
                       <Image 
                        src="https://placehold.co/80x80.png" 
                        alt="Novasdad" 
                        width={80} 
                        height={80} 
                        className="rounded-full mb-3"
                        data-ai-hint="male avatar"
                      />
                      <h4 className="font-semibold text-foreground">Novasdad</h4>
                      <p className="text-sm text-muted-foreground">Co-Owner & Lead Designer</p>
                    </div>
                  </div>
                </section>
                
                <section className="text-center text-xs text-muted-foreground pt-6 border-t">
                  <p>&copy; {new Date().getFullYear()} DVPanel. All rights reserved.</p>
                  <p>Proudly built by Road.js and the DVPanel Team.</p>
                </section>

              </CardContent>
              {/* No CardFooter or Save button for the Info tab */}
            </Card>
          </TabsContent>

        </form>
      </Tabs>
    </div>
  );
}

