
"use client";
// This file is marked for DELETION.
// Debug mode settings are now user-specific and managed in the Profile dialog.

import React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from 'lucide-react';

export default function DebugSettingsPage_DEPRECATED() {
  return (
    <div>
      <PageHeader 
        title="Debug Settings (Moved)" 
        description="Debug mode preferences are now user-specific and can be managed in your Profile." 
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Settings Moved
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            To configure your personal Debug Mode preferences,
            please go to your <span className="font-semibold text-primary">Profile</span> settings, accessible from the user menu in the sidebar.
          </p>
           <p className="mt-2 text-sm text-muted-foreground">
            This global Debug Settings page has been removed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
