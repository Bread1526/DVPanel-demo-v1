
"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, UserPlus, Edit, Trash2, ShieldQuestion, AlertCircle, Loader2 } from "lucide-react";
import AddUserRoleDialog from "./components/add-user-role-dialog";
import { loadUsers, deleteUser, type UserData, type UserActionState } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


const rolesDefinitions = [
  { name: "Owner", description: "Full system access. Cannot be modified or managed here." },
  { name: "Administrator", description: "Access to all projects and system features, except user management." },
  { name: "Admin", description: "Assigned to specific projects with full control over them." },
  { name: "Custom", description: "Granular permissions assigned per module or page." },
];

const OWNER_USERNAME = "root_owner"; // Define the owner username to filter out

export default function RolesPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);


  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadUsers();
      if (result.status === "success" && result.users) {
        // Filter out the owner account from the display list
        setUsers(result.users.filter(u => u.username !== OWNER_USERNAME));
      } else {
        setError(result.error || "Failed to load users.");
        setUsers([]);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(`An unexpected error occurred: ${err.message}`);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    startDeleteTransition(async () => {
      const result: UserActionState = await deleteUser(userToDelete.id);
      if (result.status === "success") {
        toast({ title: "User Deleted", description: result.message, duration: 5000 });
        fetchUsers(); // Refresh the list
      } else {
        toast({ title: "Error Deleting User", description: result.message, variant: "destructive", duration: 5000 });
      }
      setUserToDelete(null); // Close dialog
    });
  };


  return (
    <div>
      <PageHeader 
        title="User Roles & Permissions" 
        description="Manage users and their access levels within DVPanel."
        actions={<AddUserRoleDialog onUserChange={fetchUsers} />}
      />

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 text-destructive border border-destructive/30 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>User List</CardTitle>
            <CardDescription>All registered users (excluding Owner) and their assigned roles.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : users.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">No users found.</p>
            ) : (
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
                        <Badge variant={user.role === 'Administrator' ? 'secondary' : 'outline'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.status === 'Active' ? 'default' : 'destructive'} 
                          className={user.status === 'Active' ? 'bg-green-500/20 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-500/30' : ''}
                        >
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
                            <AddUserRoleDialog 
                              isEditing={true} 
                              userData={user} 
                              onUserChange={fetchUsers}
                              triggerButton={
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}> 
                                  <Edit className="mr-2 h-4 w-4" /> Edit User / Role
                                </DropdownMenuItem>
                              }
                            />
                            <DropdownMenuItem><ShieldQuestion className="mr-2 h-4 w-4" /> View Permissions</DropdownMenuItem>
                            
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem 
                                  className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground"
                                  onSelect={(e) => { e.preventDefault(); setUserToDelete(user); }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete User
                                </DropdownMenuItem>
                            </AlertDialogTrigger>

                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Role Definitions</CardTitle>
            <CardDescription>Standard roles available in DVPanel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rolesDefinitions.map(role => (
              <div key={role.name} className="p-3 border rounded-lg bg-card/50">
                <h4 className="font-semibold">{role.name}</h4>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            ))}
            {/* <Button variant="outline" className="w-full shadow-md hover:scale-105 transform transition-transform duration-150" disabled>
              <PlusCircle className="mr-2 h-4 w-4" /> Create Custom Role (Soon)
            </Button> */}
          </CardContent>
        </Card>
      </div>
      
      {userToDelete && (
        <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the user account for 
                <span className="font-semibold"> {userToDelete.username}</span>.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setUserToDelete(null)} disabled={isPendingDelete}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteUser} disabled={isPendingDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {isPendingDelete ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete User
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}

    </div>
  );
}
