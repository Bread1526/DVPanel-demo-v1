
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Layers, AlertTriangle, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" description="Welcome to DVPanel. Here's an overview of your system." />
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">
              +2 from last week
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500 flex items-center">
              <CheckCircle className="h-6 w-6 mr-2" /> Optimal
            </div>
            <p className="text-xs text-muted-foreground">
              All systems running smoothly
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Ports</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">
              Review firewall settings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1</div>
            <p className="text-xs text-muted-foreground">
              Unusual login attempt
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Overview of recent actions and logs.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-center justify-between text-sm">
                <span>Project "WebApp" deployed</span>
                <span className="text-muted-foreground">2 min ago</span>
              </li>
              <li className="flex items-center justify-between text-sm">
                <span>User "dev_admin" logged in</span>
                <span className="text-muted-foreground">15 min ago</span>
              </li>
              <li className="flex items-center justify-between text-sm">
                <span>Port 8080 opened for "APIServer"</span>
                <span className="text-muted-foreground">1 hour ago</span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks at your fingertips.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Link href="/projects" asChild>
              <Button className="w-full sm:w-auto shadow-md hover:scale-105 transform transition-transform duration-150">Manage Projects</Button>
            </Link>
            <Link href="/files" asChild>
             <Button variant="secondary" className="w-full sm:w-auto shadow-md hover:scale-105 transform transition-transform duration-150">File Manager</Button>
            </Link>
             <Link href="/settings" asChild>
             <Button variant="outline" className="w-full sm:w-auto shadow-md hover:scale-105 transform transition-transform duration-150">Settings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
