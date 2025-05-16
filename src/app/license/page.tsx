"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ShieldCheck, Loader2, KeyRound } from "lucide-react";
import React, { useState } from "react";
import { verifyLicenseKey } from "./actions";

interface LicenseStatus {
  status: "valid" | "invalid" | "pending" | "error" | "idle";
  pro: boolean;
  features?: {
    project_limit: string;
    advanced_logs: boolean;
    custom_daemon_configs: boolean;
  };
  message?: string;
}

export default function LicensePage() {
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({ status: "idle", pro: false });

  const handleVerifyLicense = async () => {
    if (!licenseKey) {
      setLicenseStatus({ status: "error", pro: false, message: "Please enter a license key." });
      return;
    }
    setLicenseStatus({ status: "pending", pro: false });
    try {
      const result = await verifyLicenseKey(licenseKey);
      setLicenseStatus(result);
    } catch (error) {
      setLicenseStatus({ status: "error", pro: false, message: "Failed to verify license. Please try again." });
    }
  };

  return (
    <div>
      <PageHeader 
        title="License Management" 
        description="Manage your DVPanel license and features."
      />

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" />
            DVPanel License
          </CardTitle>
          <CardDescription>
            Enter your Pro license key to unlock additional features. If you don't have a key, DVPanel will operate in Free mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="license-key">License Key</Label>
            <div className="flex gap-2">
              <Input 
                id="license-key" 
                type="text" 
                placeholder="XXXX-XXXX-XXXX-XXXX" 
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                className="flex-grow"
              />
              <Button onClick={handleVerifyLicense} disabled={licenseStatus.status === 'pending'} className="shadow-md hover:scale-105 transform transition-transform duration-150">
                {licenseStatus.status === 'pending' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Verify
              </Button>
            </div>
          </div>

          {licenseStatus.status !== 'idle' && (
            <Alert variant={licenseStatus.status === 'valid' ? "default" : licenseStatus.status === 'error' || licenseStatus.status === 'invalid' ? "destructive" : "default"} 
                   className={licenseStatus.status === 'valid' ? 'bg-green-500/10 border-green-500/30' : ''}>
              {licenseStatus.status === 'valid' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {(licenseStatus.status === 'invalid' || licenseStatus.status === 'error') && <XCircle className="h-5 w-5 text-destructive" />}
              {licenseStatus.status === 'pending' && <Loader2 className="h-5 w-5 animate-spin" />}
              
              <AlertTitle>
                {licenseStatus.status === 'valid' && "License Valid"}
                {licenseStatus.status === 'invalid' && "License Invalid"}
                {licenseStatus.status === 'pending' && "Verifying License..."}
                {licenseStatus.status === 'error' && "Verification Error"}
              </AlertTitle>
              <AlertDescription>
                {licenseStatus.status === 'valid' && `DVPanel Pro is active. Enjoy your enhanced features!`}
                {licenseStatus.status === 'invalid' && (licenseStatus.message || "The provided license key is invalid or expired.")}
                {licenseStatus.status === 'pending' && "Please wait while we verify your license key."}
                {licenseStatus.status === 'error' && (licenseStatus.message || "An unexpected error occurred.")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-4 pt-6 border-t">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Current Status:</span>
                {licenseStatus.pro ? (
                    <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground">Pro Version</Badge>
                ) : (
                    <Badge variant="secondary">Free Version</Badge>
                )}
            </div>
            {licenseStatus.pro && licenseStatus.features && (
                <div>
                    <h4 className="font-semibold mb-2">Pro Features Unlocked:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                        <li>Project Limit: <span className="font-medium text-foreground">{licenseStatus.features.project_limit}</span></li>
                        <li>Advanced Logs: {licenseStatus.features.advanced_logs ? <CheckCircle className="inline h-4 w-4 text-green-500"/> : <XCircle className="inline h-4 w-4 text-red-500"/>}</li>
                        <li>Custom Daemon Configs: {licenseStatus.features.custom_daemon_configs ? <CheckCircle className="inline h-4 w-4 text-green-500"/> : <XCircle className="inline h-4 w-4 text-red-500"/>}</li>
                    </ul>
                </div>
            )}
             {!licenseStatus.pro && (
                <div>
                    <h4 className="font-semibold mb-2">Free Version Limitations:</h4>
                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                        <li>Project Limit: 3 Projects</li>
                        <li>Admin Accounts: 1</li>
                        <li>Basic Logs Only</li>
                        <li>Standard Daemon Configurations</li>
                    </ul>
                    <Button variant="link" className="p-0 h-auto mt-2 text-primary">Upgrade to Pro</Button>
                </div>
            )}
        </CardFooter>
      </Card>
    </div>
  );
}
