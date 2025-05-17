
"use client"; // Keep as client component if direct navigation is still desired as fallback

import React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export default function PanelLogsPage() {
  return (
    <div>
      <PageHeader 
        title="Panel Activity Logs" 
        description="View system and user activity logs."
      />
      <Card>
        <CardHeader>
          <CardTitle>Access Logs</CardTitle>
          <CardDescription>
            Panel logs are now primarily viewed via the dialog accessible from your user profile dropdown menu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Info className="h-16 w-16 text-primary mb-4" />
            <h3 className="text-xl font-semibold text-foreground">Logs Viewer Moved</h3>
            <p className="text-muted-foreground">
              Please use the "Panel Logs" option in your user profile dropdown (top right of the sidebar) to view activity logs.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
