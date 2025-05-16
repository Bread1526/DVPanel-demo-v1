
"use client";

import React, { useState, useEffect } from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save } from "lucide-react";
// import { savePanelSettings, type SavePanelSettingsState } from './actions'; // Action removed
import { useToast } from "@/hooks/use-toast";
// import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // No longer used for form errors here

// const initialState: SavePanelSettingsState = { // State for action removed
//   message: "",
//   status: "idle",
// };

// function SubmitButton() { // Submit button using useFormStatus removed
//   const { pending } = useFormStatus();
//   return (
//     <Button type="submit" disabled={pending} className="shadow-md hover:scale-105 transform transition-transform duration-150">
//       {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
//       Save Panel Settings
//     </Button>
//   );
// }

export default function SettingsPage() {
  const [currentPanelPort, setCurrentPanelPort] = useState("27407");
  const [currentPanelIp, setCurrentPanelIp] = useState("");

  // const [formState, formAction] = useActionState(savePanelSettings, initialState); // Action state removed
  const { toast } = useToast();

  // useEffect(() => { // Effect for form state toasts removed
  //   if (formState.status === "success" && formState.message) {
  //     toast({
  //       title: "Settings Update",
  //       description: formState.message,
  //     });
  //   } else if (formState.status === "error" && formState.message) {
  //     let description = formState.message;
  //     if (formState.errors?.panelPort) {
  //       description += ` Port: ${formState.errors.panelPort.join(', ')}`;
  //     }
  //     if (formState.errors?.panelIp) {
  //       description += ` IP: ${formState.errors.panelIp.join(', ')}`;
  //     }
  //     toast({
  //       title: "Error Saving Settings",
  //       description: description,
  //       variant: "destructive",
  //     });
  //   }
  // }, [formState, toast]);

  const handleSavePanelSettings = () => {
    // Placeholder for future implementation (e.g., saving to local JSON)
    console.log("Panel Settings to save:", { panelPort: currentPanelPort, panelIp: currentPanelIp });
    toast({
      title: "Save Action (Placeholder)",
      description: "Panel settings save functionality is pending implementation.",
    });
  };


  return (
    <div>
      <PageHeader 
        title="Settings" 
        description="Configure panel, daemon, and security settings."
      />

      <Tabs defaultValue="panel" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:w-[500px]">
          <TabsTrigger value="panel">Panel Settings</TabsTrigger>
          <TabsTrigger value="daemon">Daemon Settings</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="panel">
          {/* Form tag removed, using direct handler for now */}
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
                  />
                </div>
                {/* Error display via Alert removed */}
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
                 {/* Error display via Alert removed */}
                <p className="text-sm text-muted-foreground md:col-span-3 md:pl-[calc(33.33%+1rem)]">
                  If using a domain, ensure your reverse proxy (e.g., Nginx) is configured correctly to forward requests to the panel port.
                </p>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                {/* SubmitButton replaced with a standard button, disabled for now */}
                <Button 
                  onClick={handleSavePanelSettings} 
                  className="shadow-md hover:scale-105 transform transition-transform duration-150"
                  // disabled // Re-enable when save functionality is implemented
                >
                  <Save className="mr-2 h-4 w-4"/>
                   Save Panel Settings
                </Button>
              </CardFooter>
            </Card>
          {/* </form> */}
        </TabsContent>

        <TabsContent value="daemon">
          <Card>
            <CardHeader>
              <CardTitle>Daemon Settings</CardTitle>
              <CardDescription>Configure the backend daemon connection details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                <Label htmlFor="daemon-port">Daemon Port</Label>
                <Input id="daemon-port" type="number" defaultValue="8443" className="md:col-span-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                <Label htmlFor="daemon-ip">Daemon IP/Domain</Label>
                <Input id="daemon-ip" placeholder="e.g., 127.0.0.1 or daemon.mypanel.example.com" className="md:col-span-2" />
              </div>
              <p className="text-sm text-destructive md:col-span-3 md:pl-[calc(33.33%+1rem)]">
                Warning: Ensure the panel can reach the daemon at this address. Mismatched IPs/domains can cause connection issues.
              </p>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled> {/* Disabled for now */}
                <Save className="mr-2 h-4 w-4"/> Save Daemon Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Enhance your panel's security posture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div>
                <Label className="text-base font-semibold">IP Whitelisting</Label>
                <p className="text-sm text-muted-foreground mb-2">Allow access only from specific IP addresses for selected ports.</p>
                <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled>Manage IP Whitelist</Button> {/* Disabled for now */}
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="2fa" className="text-base font-semibold">Two-Factor Authentication (2FA)</Label>
                  <p className="text-sm text-muted-foreground">Require a second form of verification for logins.</p>
                </div>
                <Switch id="2fa" disabled /> {/* Disabled for now */}
              </div>

              <div>
                <Label className="text-base font-semibold">Rate Limiting</Label>
                <div className="space-y-3 mt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Login Attempts</p>
                    <Switch id="rate-limit-login" defaultChecked disabled /> {/* Disabled for now */}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm">API Usage</p>
                    <Switch id="rate-limit-api" disabled /> {/* Disabled for now */}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Project Start/Stop Actions</p>
                    <Switch id="rate-limit-project" defaultChecked disabled /> {/* Disabled for now */}
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button className="shadow-md hover:scale-105 transform transition-transform duration-150" disabled> {/* Disabled for now */}
                <Save className="mr-2 h-4 w-4"/> Save Security Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
