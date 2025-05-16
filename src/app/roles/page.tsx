
"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Edit, Trash2, AlertCircle, Loader2, Eye, ArrowLeft, ShieldQuestion } from "lucide-react"; // Added Eye, ArrowLeft
import AddUserRoleDialog from "./components/add-user-role-dialog";
import { loadUsers, deleteUser, type UserData, type UserActionState } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const rolesDefinitions = [
  { name: "Owner", description: "Full system access. Cannot be modified or managed here." },
  { name: "Administrator", description: "Access to all projects and system features, except user management." },
  { name: "Admin", description: "Assigned to specific projects with full control over them." },
  { name: "Custom", description: "Granular permissions assigned per module or page." },
];

const OWNER_USERNAME = "root_owner"; 

export default function RolesPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [viewingUserAsRole, setViewingUserAsRole] = useState<UserData | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadUsers();
      if (result.status === "success" && result.users) {
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
    if (!viewingUserAsRole) { // Only fetch users if not in "View Role" mode
      fetchUsers();
    }
  }, [fetchUsers, viewingUserAsRole]);

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    startDeleteTransition(async () => {
      const result: UserActionState = await deleteUser(userToDelete.id);
      if (result.status === "success") {
        toast({ title: "User Deleted", description: result.message, duration: 5000 });
        fetchUsers(); 
      } else {
        toast({ title: "Error Deleting User", description: result.message, variant: "destructive", duration: 5000 });
      }
      setUserToDelete(null); 
    });
  };

  const handleUserChange = () => {
    fetchUsers();
    if (viewingUserAsRole) { // If editing from view mode, refresh the viewed user's data
        const updatedUser = users.find(u => u.id === viewingUserAsRole.id);
        if (updatedUser) {
            setViewingUserAsRole(updatedUser);
        } else { // User might have been deleted or ID changed, unlikely but good to handle
            setViewingUserAsRole(null); 
        }
    }
  };

  if (viewingUserAsRole) {
    return (
      <div>
        <PageHeader 
          title={`Viewing Role: ${viewingUserAsRole.username}`}
          description={`Details for role: ${viewingUserAsRole.role}`}
          actions={
            <div className="flex gap-2">
              <Button onClick={() => setViewingUserAsRole(null)} variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
              </Button>
              <AddUserRoleDialog
                isEditing={true}
                userData={viewingUserAsRole}
                onUserChange={handleUserChange}
                triggerButton={
                  <Button variant="default" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                    <Edit className="mr-2 h-4 w-4" /> Edit Role
                  </Button>
                }
              />
            </div>
          }
        />
        <Card>
          <CardHeader>
            <CardTitle>Role Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p><span className="font-semibold">Username:</span> {viewingUserAsRole.username}</p>
            <p><span className="font-semibold">Role:</span> <Badge variant={viewingUserAsRole.role === 'Administrator' ? 'secondary' : 'outline'}>{viewingUserAsRole.role}</Badge></p>
            <p><span className="font-semibold">Status:</span> <Badge variant={viewingUserAsRole.status === 'Active' ? 'default' : 'destructive'} className={viewingUserAsRole.status === 'Active' ? 'bg-green-500/20 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-500/30' : ''}>{viewingUserAsRole.status}</Badge></p>
            
            { (viewingUserAsRole.role === 'Admin' || viewingUserAsRole.role === 'Custom') && viewingUserAsRole.projects && viewingUserAsRole.projects.length > 0 && (
              <div>
                <h4 className="font-semibold">Assigned Projects:</h4>
                <ul className="list-disc list-inside pl-4">
                  {viewingUserAsRole.projects.map(pId => <li key={pId}>{pId}</li>)} {/* Replace pId with actual project name later */}
                </ul>
              </div>
            )}
            { viewingUserAsRole.role === 'Custom' && viewingUserAsRole.assignedPages && viewingUserAsRole.assignedPages.length > 0 && (
              <div>
                <h4 className="font-semibold">Accessible Pages:</h4>
                <ul className="list-disc list-inside pl-4">
                  {viewingUserAsRole.assignedPages.map(pageId => <li key={pageId}>{pageId}</li>)} {/* Replace pageId with actual page name later */}
                </ul>
              </div>
            )}
             { (viewingUserAsRole.role === 'Administrator' || viewingUserAsRole.role === 'Admin' || viewingUserAsRole.role === 'Custom') && viewingUserAsRole.allowedSettingsPages && viewingUserAsRole.allowedSettingsPages.length > 0 && (
              <div>
                <h4 className="font-semibold">Accessible Settings Modules:</h4>
                <ul className="list-disc list-inside pl-4">
                  {viewingUserAsRole.allowedSettingsPages.map(settingId => <li key={settingId}>{settingId}</li>)} {/* Replace settingId with actual module name later */}
                </ul>
              </div>
            )}
            {/* TODO: Add more detailed permission breakdown here in the future */}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader 
        title="User Roles & Permissions" 
        description="Manage users and their access levels within DVPanel."
        actions={<AddUserRoleDialog onUserChange={handleUserChange} />}
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
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
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
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setViewingUserAsRole(user); }}>
                              <Eye className="mr-2 h-4 w-4" /> View Role
                            </DropdownMenuItem>
                            <AddUserRoleDialog 
                              isEditing={true} 
                              userData={user} 
                              onUserChange={handleUserChange}
                              triggerButton={
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}> 
                                  <Edit className="mr-2 h-4 w-4" /> Edit User / Role
                                </DropdownMenuItem>
                              }
                            />
                             <DropdownMenuItem 
                                onSelect={(e) => {
                                    e.preventDefault(); 
                                    // Placeholder for a more detailed permission view if needed in future
                                    // For now, "View Role" provides a summary
                                    toast({title: "Permissions Hint", description: "Detailed permissions view can be expanded here or within 'View Role' mode."})
                                }}
                            >
                              <ShieldQuestion className="mr-2 h-4 w-4" /> View Permissions
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground"
                              onSelect={(e) => { 
                                e.preventDefault(); 
                                setUserToDelete(user); 
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete User
                            </DropdownMenuItem>
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
          </CardContent>
        </Card>
      </div>
      
      <AlertDialog 
        open={!!userToDelete} 
        onOpenChange={(isOpen) => { 
          if (!isOpen) setUserToDelete(null); 
        }}
      >
        <AlertDialogContent>
          {userToDelete && ( 
            <>
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
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

    