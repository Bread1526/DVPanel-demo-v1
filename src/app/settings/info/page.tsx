
"use client";

import React, { useState, useEffect } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import Image from 'next/image';
import { Info as InfoIcon, Link as LinkIcon, ExternalLink, Wifi, ListTree } from "lucide-react";

const sitemapContent = (
  <div className="space-y-3 text-sm">
    <p className="font-semibold text-base">DVPanel Application Sitemap:</p>
    <ul className="list-disc list-inside space-y-1 pl-2">
      <li><strong className="font-medium">Main Sections:</strong>
        <ul className="list-circle list-inside pl-4 space-y-0.5">
          <li>Dashboard (<code>/</code>)</li>
          <li>Projects (<code>/projects</code>)</li>
          <li>File Manager (<code>/files</code>)</li>
          <li>Port Manager (<code>/ports</code>)</li>
          <li>User Roles (<code>/roles</code>)</li>
          <li>License (<code>/license</code>)</li>
          <li>Settings (<code>/settings</code>)
            <ul className="list-disc list-inside pl-6 space-y-0.5">
              <li>Panel (<code>/settings</code> or <code>/settings/panel</code>)</li>
              <li>Daemon (<code>/settings/daemon</code>)</li>
              <li>Security (<code>/settings/security</code>)</li>
              <li>Popups (<code>/settings/popups</code>)</li>
              <li>Debug (<code>/settings/debug</code>)</li>
              <li>General (<code>/settings/general</code>)</li>
              <li>Info (<code>/settings/info</code>)</li>
            </ul>
          </li>
        </ul>
      </li>
      <li><strong className="font-medium">API Endpoints:</strong>
        <ul className="list-circle list-inside pl-4 space-y-0.5">
            <li>Ping (<code>/api/ping</code>) - Used for latency check.</li>
        </ul>
      </li>
    </ul>
    <p className="mt-2 text-xs text-muted-foreground">This sitemap provides an overview of the primary navigable routes within the DVPanel application.</p>
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
    }, 500); // Update every 0.5 seconds

    // Initial ping
    (async () => {
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
        setIsPinging(false); // Set to false after initial ping, interval will keep it updated
    })();


    return () => {
      clearInterval(intervalId);
    };
  }, []);

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
                  <DialogContent className="sm:max-w-lg rounded-2xl">
                    <DialogHeader>
                      <DialogTitle>{item.title || item.label}</DialogTitle>
                    </DialogHeader>
                    <DialogDescription className="py-4 max-h-[60vh] overflow-y-auto">
                      {typeof item.content === 'string' ? <p>{item.content}</p> : item.content}
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
