
"use client";

import React, { useState, useEffect } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import Image from 'next/image';
import { Info as InfoIcon, Link as LinkIcon, ExternalLink, Wifi } from "lucide-react"; // Renamed Info to InfoIcon to avoid conflict

export default function InfoPage() {
  const [latency, setLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  useEffect(() => {
    setIsPinging(true);
    const intervalId = setInterval(async () => {
      const startTime = Date.now();
      try {
        const response = await fetch('/api/ping'); // Assuming /api/ping exists
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
      </Card>
    </div>
  );
}
