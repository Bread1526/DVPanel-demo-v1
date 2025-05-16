"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle } from "lucide-react";
import React from "react";

// Assume isPro is fetched or determined elsewhere
const isPro = true; 

export default function CreateProjectDialog() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-md hover:scale-105 transform transition-transform duration-150">
          <PlusCircle className="mr-2 h-4 w-4" /> Create Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px] rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Configure your new project environment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Project Name
            </Label>
            <Input id="name" placeholder="My Awesome App" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="directory" className="text-right">
              Directory
            </Label>
            <Input id="directory" placeholder="/srv/my-awesome-app" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="template" className="text-right">
              Template
            </Label>
            <Select>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nodejs">Node.js Express</SelectItem>
                <SelectItem value="python">Python Flask/Django</SelectItem>
                <SelectItem value="static">Static HTML/JS</SelectItem>
                <SelectItem value="php">PHP Laravel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startup-command" className="text-right">
              Startup Command
            </Label>
            <Input id="startup-command" placeholder="npm start" className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="file-limit" className="text-right">
              File Limit (MB)
            </Label>
            <Input id="file-limit" type="number" placeholder={isPro ? "e.g., 5000" : "Default (Free)"} className="col-span-3" disabled={!isPro} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="boot-on-start" className="text-right">
              Boot on Panel Start
            </Label>
            <Switch id="boot-on-start" className="col-span-3 justify-self-start" />
          </div>
          
          <h4 className="col-span-4 text-sm font-medium text-muted-foreground pt-2 border-t mt-2">Resource Limits {isPro ? "(Pro)" : "(Free Defaults)"}</h4>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cpu-limit" className="text-right">
              CPU Limit (%)
            </Label>
            <Input id="cpu-limit" type="number" placeholder={isPro ? "e.g., 50" : "Unrestricted (Free)"} className="col-span-3" disabled={!isPro} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ram-limit" className="text-right">
              RAM Limit (MB)
            </Label>
            <Input id="ram-limit" type="number" placeholder={isPro ? "e.g., 1024" : "Unrestricted (Free)"} className="col-span-3" disabled={!isPro} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="storage-limit" className="text-right">
              Storage (MB)
            </Label>
            <Input id="storage-limit" type="number" placeholder={isPro ? "e.g., 10000" : "Unrestricted (Free)"} className="col-span-3" disabled={!isPro} />
          </div>

          <h4 className="col-span-4 text-sm font-medium text-muted-foreground pt-2 border-t mt-2">Cron Job Scheduler</h4>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cron-jobs" className="text-right">
              Cron Jobs
            </Label>
            <Textarea id="cron-jobs" placeholder="* * * * * /usr/bin/backup.sh" className="col-span-3 min-h-[80px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" onClick={() => setOpen(false)}>Create Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
