
"use client";

import React from 'react'; // Added React import
import dynamic from 'next/dynamic';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, PlusCircle, PlayCircle, Terminal, FolderOpen, Trash2 } from "lucide-react";
// import CreateProjectDialog from "./components/create-project-dialog"; // Dynamic import below

const CreateProjectDialog = dynamic(() => import('./components/create-project-dialog'), {
  loading: () => <Button disabled><PlusCircle className="mr-2 h-4 w-4" /> Create Project (Loading...)</Button>,
  ssr: false
});


const projects = [
  { id: '1', name: 'E-commerce API', directory: '/srv/ecommerce-api', status: 'Running', cpu: '15%', ram: '512MB', storage: '2GB/5GB', template: 'NodeJS Express', bootOnStart: true },
  { id: '2', name: 'Company Website', directory: '/srv/company-website', status: 'Stopped', cpu: '5%', ram: '256MB', storage: '500MB/2GB', template: 'Static HTML', bootOnStart: false },
  { id: '3', name: 'Data Processing Worker', directory: '/srv/data-worker', status: 'Running', cpu: '50%', ram: '1GB', storage: '1GB/10GB', template: 'Python Celery', bootOnStart: true },
  { id: '4', name: 'Blog Platform', directory: '/srv/blog', status: 'Error', cpu: 'N/A', ram: 'N/A', storage: 'N/A', template: 'Ghost CMS', bootOnStart: true },
];

export default function ProjectsPage() {
  return (
    <div>
      <PageHeader 
        title="Projects" 
        description="Manage your application projects and their environments."
        actions={CreateProjectDialog && <CreateProjectDialog />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Project List</CardTitle>
          <CardDescription>A list of all configured projects in your DVPanel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Directory</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>RAM</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>
                    <Badge variant={project.status === 'Running' ? 'default' : project.status === 'Stopped' ? 'secondary' : 'destructive'}>
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{project.directory}</TableCell>
                  <TableCell>{project.cpu}</TableCell>
                  <TableCell>{project.ram}</TableCell>
                  <TableCell>{project.storage}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><PlayCircle className="mr-2 h-4 w-4" /> Start/Stop</DropdownMenuItem>
                        <DropdownMenuItem><Terminal className="mr-2 h-4 w-4" /> Open Terminal</DropdownMenuItem>
                        <DropdownMenuItem><FolderOpen className="mr-2 h-4 w-4" /> Manage Files</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
