
"use client";

import React, { useState, useEffect } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import Image from 'next/image';
import { 
  Info as InfoIcon, 
  Link as LinkIcon, 
  ExternalLink, 
  Wifi, 
  ListTree,
  LayoutDashboard,
  Settings,
  SlidersHorizontal,
  HardDrive,
  Shield,
  MessageSquareMore,
  Bug,
  Settings2, // For General settings item
  Terminal,
  Layers,
  FileText,
  Network,
  Users,
  ShieldCheck
} from "lucide-react";

const sitemapContent = (
  <div className="space-y-6 text-sm">
    <div className="p-4 border rounded-lg bg-card shadow-sm">
      <h3 className="text-lg font-semibold mb-3 text-primary flex items-center">
        <LayoutDashboard className="mr-2 h-5 w-5" /> Main Application
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { name: 'Dashboard', path: '/', icon: LayoutDashboard },
          { name: 'Projects', path: '/projects', icon: Layers },
          { name: 'File Manager', path: '/files', icon: FileText },
          { name: 'Port Manager', path: '/ports', icon: Network },
          { name: 'User Roles', path: '/roles', icon: Users },
          { name: 'License', path: '/license', icon: ShieldCheck },
        ].map(page => (
          <div key={page.name} className="p-3 border rounded-md bg-background hover:shadow-lg hover:scale-[1.02] transition-all duration-150 ease-in-out">
            <div className="flex items-center mb-1">
              <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <p className="font-medium text-foreground">{page.name}</p>
            </div>
            <p className="text-xs text-muted-foreground ml-6">{page.path}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="p-4 border rounded-lg bg-card shadow-sm">
      <h3 className="text-lg font-semibold mb-3 text-primary flex items-center">
        <Settings className="mr-2 h-5 w-5" /> Settings Pages
      </h3>
      <div className="space-y-3">
        <div className="p-3 border rounded-md bg-background hover:shadow-lg hover:scale-[1.02] transition-all duration-150 ease-in-out">
          <div className="flex items-center mb-1">
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            <p className="font-medium text-foreground">Settings Entry</p>
          </div>
          <p className="text-xs text-muted-foreground ml-6">/settings (Defaults to Panel)</p>
        </div>
        <div className="ml-4 pl-4 border-l-2 border-primary/30 space-y-2 py-2">
          {[
            { name: 'Panel', path: '/settings', icon: SlidersHorizontal }, // Default settings route
            { name: 'Daemon', path: '/settings/daemon', icon: HardDrive },
            { name: 'Security', path: '/settings/security', icon: Shield },
            { name: 'Popups', path: '/settings/popups', icon: MessageSquareMore },
            { name: 'Debug', path: '/settings/debug', icon: Bug },
            { name: 'General', path: '/settings/general', icon: Settings2 },
            { name: 'Info', path: '/settings/info', icon: InfoIcon },
          ].map(page => (
            <div key={page.name} className="p-3 border rounded-md bg-background hover:shadow-lg hover:scale-[1.02] transition-all duration-150 ease-in-out flex items-start">
              <page.icon className="mr-2 h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">{page.name}</p>
                <p className="text-xs text-muted-foreground">{page.path}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    
    <div className="p-4 border rounded-lg bg-card shadow-sm">
      <h3 className="text-lg font-semibold mb-3 text-primary flex items-center">
        <Terminal className="mr-2 h-5 w-5" /> API Endpoints
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
         <div className="p-3 border rounded-md bg-background hover:shadow-lg hover:scale-[1.02] transition-all duration-150 ease-in-out">
            <div className="flex items-center mb-1">
              <LinkIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              <p className="font-medium text-foreground">Ping</p>
            </div>
            <p className="text-xs text-muted-foreground ml-6">/api/ping - Used for latency check.</p>
          </div>
      </div>
    </div>

    <p className="mt-4 text-xs text-center text-muted-foreground">
      This visual sitemap provides an overview of the DVPanel application structure.
    </p>
  </div>
);

const infoPageDialogs = [
  { label: "Sitemap", icon: ListTree, content: sitemapContent, title: "Application Sitemap" },
  { label: "Terms of Service", content: "Terms of Service details will be available here. DVPanel is provided 'as-is' without any warranties. Use at your own risk. We are not liable for any data loss or damages resulting from its use." },
  { label: "License", content: "License details (e.g., MIT, Apache 2.0) will be here. Currently, DVPanel source code is proprietary unless otherwise stated." },
  { label: "Privacy Policy", content: "Privacy Policy details will be available here. DVPanel may collect anonymous usage data if telemetry is enabled (feature pending). No personal data is collected by default." },
];

export default function InfoPage() {
  const [latency, setLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const pingServer = async () => {
      if (!isPinging && latency === null) setIsPinging(true); // Only set isPinging if not already pinging and latency is null
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
      } finally {
        // Only set isPinging to false if it was true and there's an intervalId
        // This prevents premature 'Unavailable' if the first ping fails quickly
        if (isPinging && latency !== null && intervalId) setIsPinging(false);
      }
    };

    pingServer(); 
    intervalId = setInterval(pingServer, 500); 

    return () => {
      clearInterval(intervalId);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  return (
    <div>
      <PageHeader title="Information" description="Details about DVPanel, resources, and credits." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><InfoIcon className="h-6 w-6 text-primary"/>DVPanel Information</CardTitle>
          <CardDescription>Learn more about DVPanel and find helpful resources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <section>
            <h3 className="text-lg font-semibold mb-3">Informational Links</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {infoPageDialogs.map(item => (
                <Dialog key={item.label}>
                  <DialogTrigger asChild>
                    <Button variant="link" className="p-0 h-auto justify-start text-primary hover:underline">
                      {item.icon ? <item.icon className="mr-2 h-4 w-4" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                      {item.label}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className={`rounded-2xl backdrop-blur-sm ${item.label === "Sitemap" ? 'sm:max-w-2xl md:max-w-3xl lg:max-w-4xl' : 'sm:max-w-lg'}`}>
                    <DialogHeader>
                      <DialogTitle>{item.title || item.label}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 max-h-[70vh] overflow-y-auto">
                      {typeof item.content === 'string' 
                        ? <p className="text-sm text-muted-foreground">{item.content}</p> 
                        : item.content /* This is the sitemap JSX */}
                    </div>
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
              {latency === null && !isPinging && <span className="text-red-500 font-semibold">Unavailable</span>}
            </div>
             <p className="text-xs text-muted-foreground mt-1">Latency to the server hosting this panel instance. Updates every 0.5 seconds.</p>
          </section>

          <section>
            <h3 className="text-lg font-semibold mb-4">Credits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col items-center text-center p-4 border rounded-lg shadow-sm bg-card/50">
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
              <div className="flex flex-col items-center text-center p-4 border rounded-lg shadow-sm bg-card/50">
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
      </Card>
    </div>
  );
}

