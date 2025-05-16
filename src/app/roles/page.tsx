import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, PlusCircle, UserPlus, Edit, Trash2, ShieldQuestion } from "lucide-react";
import AddUserRoleDialog from "./components/add-user-role-dialog";

const users = [
  { id: '1', username: 'root_owner', email: 'owner@dvpanel.local', role: 'Owner', status: 'Active', lastLogin: '2023-10-26 10:00 AM' },
  { id: '2', username: 'sys_admin', email: 'admin@dvpanel.local', role: 'Administrator', status: 'Active', lastLogin: '2023-10-25 03:15 PM' },
  { id: '3', username: 'project_manager_jane', email: 'jane.doe@example.com', role: 'Admin', status: 'Active', projects: ['E-commerce API', 'Blog Platform'], lastLogin: '2023-10-26 09:30 AM' },
  { id: '4', username: 'dev_john', email: 'john.smith@example.com', role: 'Custom (DevOps)', status: 'Inactive', projects: ['Data Processing Worker'], lastLogin: '2023-10-20 11:00 AM' },
];

const roles = [
  { name: "Owner", description: "Full system access. Cannot be modified." },
  { name: "Administrator", description: "Access to all projects and system features, except user management." },
  { name: "Admin", description: "Assigned to specific projects with full control over them." },
  { name: "Custom", description: "Granular permissions assigned per module or page." },
]

export default function RolesPage() {
  return (
    <div>
      <PageHeader 
        title="User Roles & Permissions" 
        description="Manage users and their access levels within DVPanel."
        actions={<AddUserRoleDialog />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>User List</CardTitle>
            <CardDescription>All registered users and their assigned roles.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'Owner' ? 'default' : user.role === 'Administrator' ? 'secondary' : 'outline'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'Active' ? 'default' : 'destructive'} className={user.status === 'Active' ? 'bg-green-500/20 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-500/30' : ''}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Edit className="mr-2 h-4 w-4" /> Edit User / Role</DropdownMenuItem>
                          <DropdownMenuItem><ShieldQuestion className="mr-2 h-4 w-4" /> View Permissions</DropdownMenuItem>
                          {user.role !== 'Owner' && (
                             <DropdownMenuItem className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Role Definitions</CardTitle>
            <CardDescription>Standard roles available in DVPanel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {roles.map(role => (
              <div key={role.name} className="p-3 border rounded-lg bg-card/50">
                <h4 className="font-semibold">{role.name}</h4>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            ))}
            <Button variant="outline" className="w-full shadow-md hover:scale-105 transform transition-transform duration-150">
              <PlusCircle className="mr-2 h-4 w-4" /> Create Custom Role
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
