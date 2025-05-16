import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Folder, File, Upload, Download, Edit3, Trash2, KeyRound, Search } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

const files = [
  { id: '1', name: 'app', type: 'folder', size: '4.2MB', modified: '2023-10-26', permissions: 'drwxr-xr-x' },
  { id: '2', name: 'public', type: 'folder', size: '1.5MB', modified: '2023-10-25', permissions: 'drwxr-xr-x' },
  { id: '3', name: 'package.json', type: 'file', size: '1.2KB', modified: '2023-10-26', permissions: '-rw-r--r--' },
  { id: '4', name: 'next.config.js', type: 'file', size: '0.8KB', modified: '2023-10-24', permissions: '-rw-r--r--' },
  { id: '5', name: '.env.example', type: 'file', size: '0.2KB', modified: '2023-10-20', permissions: '-rw-r--r--' },
];

export default function FilesPage() {
  return (
    <div>
      <PageHeader 
        title="Root File Manager" 
        description="Manage all files and folders on your server. (Owner access only)"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150">
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>File Explorer</CardTitle>
              <CardDescription className="mt-1">Current path: /srv/www/</CardDescription>
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="search" placeholder="Search files..." className="pl-8 w-full sm:w-[250px]" />
            </div>
          </div>
          <Breadcrumb className="mt-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">/</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">srv</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>www</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    {file.type === 'folder' ? <Folder className="h-5 w-5 text-primary" /> : <File className="h-5 w-5 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{file.name}</TableCell>
                  <TableCell className="text-muted-foreground">{file.size}</TableCell>
                  <TableCell className="text-muted-foreground">{file.modified}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{file.permissions}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {file.type === 'file' && <DropdownMenuItem><Download className="mr-2 h-4 w-4" /> Download</DropdownMenuItem>}
                        <DropdownMenuItem><Edit3 className="mr-2 h-4 w-4" /> Edit / Rename</DropdownMenuItem>
                        <DropdownMenuItem><KeyRound className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
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
