
"use client";

import React, { useState, useEffect } from 'react';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2, Settings as SettingsIcon, SlidersHorizontal, Shield } from "lucide-react";
import { savePanelSettings, loadPanelSettings, type SavePanelSettingsState } from './actions';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialSaveState: SavePanelSettingsState = {
  message: "",
  status: "idle",
};

export default function SettingsPage() {
  const [currentPanelPort, setCurrentPanelPort] = useState("27407");
  const [currentPanelIp, setCurrentPanelIp] = useState("");
  const [currentDebugMode, setCurrentDebugMode] = useState(false);
  
  const { toast } = useToast();

  // Load initial settings
  useEffect(() => {
    const fetchSettings = async () => {
      const result = await loadPanelSettings();
      if (result.status === 'success' && result.data) {
        setCurrentPanelPort(result.data.panelPort);
        setCurrentPanelIp(result.data.panelIp);
        setCurrentDebugMode(result.data.debugMode);
        toast({
          title: "Settings Loaded",
          description: `Panel settings loaded successfully${result.data.debugMode && result.message ? `. ${result.message}` : result.data.debugMode ? '.' : ''}`,
        });
      } else if (result.status === 'not_found') {
        setCurrentPanelPort(result.data?.panelPort || "27407");
        setCurrentPanelIp(result.data?.panelIp || "");
        setCurrentDebugMode(result.data?.debugMode || false);
        toast({
          title: "Settings Info",
          description: result.message || "No existing settings found. Using defaults.",
          variant: "default",
        });
      } else if (result.status === 'error') {
        setCurrentPanelPort(result.data?.panelPort || "27407");
        setCurrentPanelIp(result.data?.panelIp || "");
        setCurrentDebugMode(result.data?.debugMode || false);
        toast({
          title: "Error Loading Settings",
          description: result.message || "Could not load panel settings.",
          variant: "destructive",
        });
      }
    };
    fetchSettings();
  }, [toast]);

  const [formState, formAction, isPending] = useActionState(savePanelSettings, initialSaveState);

  useEffect(() => {
    if (formState.status === "success" && formState.message) {
      toast({
        title: "Settings Update",
        description: formState.message, // Message now includes filename if debug is on
      });
      if (formState.data) {
        setCurrentPanelPort(formState.data.panelPort);
        setCurrentPanelIp(formState.data.panelIp);
        setCurrentDebugMode(formState.data.debugMode);
      }
    } else if (formState.status === "error" && formState.message) {
      let description = formState.message;
      if (formState.errors?.panelPort) {
        description += ` Port: ${formState.errors.panelPort.join(', ')}`;
      }
      if (formState.errors?.panelIp) {
        description += ` IP: ${formState.errors.panelIp.join(', ')}`;
      }
       if (formState.errors?.debugMode) {
        description += ` Debug Mode: ${formState.errors.debugMode.join(', ')}`;
      }
      if (formState.errors?.general) {
        description = formState.errors.general; 
      }
      toast({
        title: "Error Saving Settings",
        description: description,
        variant: "destructive",
      });
    }
  }, [formState, toast]);
  

  return (
    <div>
      <PageHeader 
        title="Settings" 
        description="Configure panel, daemon, security, and general application settings."
      />

      <Tabs defaultValue="panel" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 md:w-auto">
          <TabsTrigger value="panel">
            <SlidersHorizontal className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Panel Settings
          </TabsTrigger>
          <TabsTrigger value="daemon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4 md:hidden lg:inline-block"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19 12h2"/><path d="M3 12h2"/><path d="M12 5V3"/><path d="M12 21v-2"/></svg>
            Daemon Settings
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4 md:hidden lg:inline-block" />Security
          </TabsTrigger>
          <TabsTrigger value="general">
            <SettingsIcon className="mr-2 h-4 w-4 md:hidden lg:inline-block" />General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="panel">
          <form action={formAction}>
             {/* Hidden input for debug mode to be included in panel settings form */}
            <input type="hidden" name="debug-mode" value={currentDebugMode ? "on" : ""} />
            <Card>
              <CardHeader>
                <CardTitle>Panel Settings</CardTitle>
                <CardDescription>Customize how your DVPanel is accessed and operates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                  <Label htmlFor="panel-port">Panel Port</Label>
                  <Input 
                    id="panel-port" 
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
                  <Label htmlFor="panel-ip">Panel IP/Domain</Label>
                  <Input 
                    id="panel-ip" 
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
          </form>
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
              <Button className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
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
              <Button className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
                <Save className="mr-2 h-4 w-4"/> Save Security Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="general">
          <form action={formAction}>
            {/* Hidden inputs for panel port and IP to be included in general settings form submission if needed, or handle forms separately */}
            <input type="hidden" name="panel-port" value={currentPanelPort} />
            <input type="hidden" name="panel-ip" value={currentPanelIp} />
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
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

