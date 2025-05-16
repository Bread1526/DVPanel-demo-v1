
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, Ban, XCircle, Sparkles, FileWarning, PlusCircle, ShieldAlert, Trash2 } from "lucide-react"; // Added Trash2
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const allowedPorts = [
  { id: '1', port: '80', protocol: 'TCP', service: 'HTTP Web Server', project: 'Company Website', actions: ['Pause', 'Block'] },
  { id: '2', port: '443', protocol: 'TCP', service: 'HTTPS Web Server', project: 'Company Website', actions: ['Pause', 'Block'] },
  { id: '3', port: '3000', protocol: 'TCP', service: 'NodeJS App', project: 'E-commerce API', actions: ['Pause', 'Block'] },
  { id: '4', port: '5432', protocol: 'TCP', service: 'PostgreSQL DB', project: 'Shared Database', actions: ['Pause', 'Block'] },
];

const runningPorts = [
  { id: '1', port: '80', protocol: 'TCP', processId: '1234', processName: 'nginx', project: 'Company Website', user: 'www-data' },
  { id: '2', port: '443', protocol: 'TCP', processId: '1235', processName: 'nginx', project: 'Company Website', user: 'www-data' },
  { id: '3', port: '3000', protocol: 'TCP', processId: '5678', processName: 'node', project: 'E-commerce API', user: 'appuser' },
  { id: '4', port: '22', protocol: 'TCP', processId: '910', processName: 'sshd', project: 'System', user: 'root' },
];

export default function PortsPage() {
  return (
    <div>
      <PageHeader 
        title="Port Manager" 
        description="View and manage allowed and currently open ports on your server."
        actions={
          <Button className="shadow-md hover:scale-105 transform transition-transform duration-150">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Allowed Port
          </Button>
        }
      />

      <Alert className="mb-6 bg-primary/10 border-primary/30">
        <Sparkles className="h-5 w-5 text-primary" />
        <AlertTitle className="text-primary">AI Security Advisor</AlertTitle>
        <AlertDescription>
          Consider restricting port 22 (SSH) to known IP addresses only. Port 5432 (PostgreSQL) should ideally not be exposed publicly unless necessary; use a VPN or bastion host.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="running" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:w-[400px]">
          <TabsTrigger value="running">Running Ports</TabsTrigger>
          <TabsTrigger value="allowed">Allowed Ports</TabsTrigger>
        </TabsList>
        <TabsContent value="running">
          <Card>
            <CardHeader>
              <CardTitle>Running Ports</CardTitle>
              <CardDescription>Currently open ports and the processes using them.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Port</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Process ID</TableHead>
                    <TableHead>Process Name</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runningPorts.map((port) => (
                    <TableRow key={port.id}>
                      <TableCell className="font-medium">{port.port}</TableCell>
                      <TableCell>{port.protocol}</TableCell>
                      <TableCell>{port.processId}</TableCell>
                      <TableCell>{port.processName}</TableCell>
                      <TableCell>{port.project}</TableCell>
                      <TableCell>{port.user}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><XCircle className="mr-2 h-4 w-4" /> Kill Process</DropdownMenuItem>
                            <DropdownMenuItem><Ban className="mr-2 h-4 w-4" /> Pause Traffic</DropdownMenuItem>
                            <DropdownMenuItem><FileWarning className="mr-2 h-4 w-4" /> Send to Nginx Page</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="allowed">
          <Card>
            <CardHeader>
              <CardTitle>Allowed Ports (Firewall Rules)</CardTitle>
              <CardDescription>Ports explicitly allowed through the firewall.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Port</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Service/Description</TableHead>
                    <TableHead>Associated Project</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allowedPorts.map((port) => (
                    <TableRow key={port.id}>
                      <TableCell className="font-medium">{port.port}</TableCell>
                      <TableCell>{port.protocol}</TableCell>
                      <TableCell>{port.service}</TableCell>
                      <TableCell>{port.project}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><ShieldAlert className="mr-2 h-4 w-4" /> Modify Rule</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                              <Trash2 className="mr-2 h-4 w-4" /> Remove Rule
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
