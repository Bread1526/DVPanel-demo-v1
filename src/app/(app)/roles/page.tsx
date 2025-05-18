
"use client";

import React, { useState, useEffect, useTransition, useCallback, useRef } from "react";
import dynamic from 'next/dynamic';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Edit, Trash2, AlertCircle, Loader2, Eye, UserPlus, UserCog, Menu, X } from "lucide-react";
import { loadUsers, deleteUser, startImpersonation as startImpersonationAction, type UserData, type UserActionState } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogCoreDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogCoreTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogFooter as DialogCoreFooter, DialogContent as DialogCoreContent, DialogHeader as DialogCoreHeader, DialogTitle as DialogCoreTitle, DialogDescription as DialogCoreDescription} from "@/components/ui/dialog"; 
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const AddUserRoleDialog = dynamic(() => import('./components/add-user-role-dialog'), {
  loading: () => (
    <Button disabled className="shadow-md">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Add User
    </Button>
  ),
  ssr: false
});

const availableProjects = [ 
  { id: 'project_ecommerce_api', name: 'E-commerce API'},
  { id: 'project_company_website', name: 'Company Website'},
  { id: 'project_data_worker', name: 'Data Processing Worker'},
  { id: 'project_blog_platform', name: 'Blog Platform'},
];

const availableAppPages = [
  { id: 'dashboard', name: 'Dashboard (/)' },
  { id: 'projects_page', name: 'Projects Page (/projects)' },
  { id: 'files', name: 'File Manager (/files)' },
  { id: 'ports', name: 'Port Manager (/ports)' },
  { id: 'settings_area', name: 'Settings Area (/settings)' }, 
  { id: 'logs_page', name: 'Panel Logs (via Profile)'},
];

const availableSettingsPages = [
  { id: 'settings_general', name: 'General Settings' },
  { id: 'settings_panel', name: 'Panel Settings' },
  { id: 'settings_daemon', name: 'Daemon Settings' },
  { id: 'settings_security', name: 'Security Settings' },
  { id: 'settings_license', name: 'License Settings' },
  { id: 'settings_info', name: 'Info Page' },
];

export default function RolesPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  
  const [userToViewDetails, setUserToViewDetails] = useState<UserData | null>(null); 
  
  const [isPendingImpersonation, startImpersonationTransition] = useTransition();

  const [primedUserId, setPrimedUserId] = useState<string | null>(null);
  const [openDropdownUserId, setOpenDropdownUserId] = useState<string | null>(null);
  const dropdownMenuRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());


  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadUsers();
      if (result.status === "success" && result.users) {
        setUsers(result.users.filter(user => user.id !== 'owner_root')); 
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
        fetchUsers(); 
      } else {
        toast({ title: "Error Deleting User", description: result.message || "An unknown error occurred.", variant: "destructive", duration: 5000 });
      }
      setUserToDelete(null); 
    });
  };

  const handleStartImpersonation = (userId: string) => {
    startImpersonationTransition(async () => {
        const result = await startImpersonationAction(userId);
        if (result.status === "error") {
            toast({ title: "Impersonation Failed", description: result.message, variant: "destructive" });
        }
        // If successful, the action handles redirect.
    });
  };

  const handleUserChange = useCallback(async () => { 
    await fetchUsers(); // Refetch all users
    if (userToViewDetails) { 
        const updatedUser = users.find(u => u.id === userToViewDetails.id);
        setUserToViewDetails(updatedUser || null); 
    }
  }, [fetchUsers, userToViewDetails, users]); // Added users to dependency array

  const findNameById = (id: string, list: {id: string, name: string}[]) => list.find(item => item.id === id)?.name || id;

  const handleActionButtonClick = (userId: string) => {
    if (primedUserId === userId) {
      // This is the second click on the same button
      setOpenDropdownUserId(userId); // Open the dropdown
      setPrimedUserId(null); // Reset primed state
    } else {
      // This is the first click, or a click on a different button
      setOpenDropdownUserId(null); // Close any other open dropdown
      setPrimedUserId(userId); // Prime this button
    }
  };

  const onDropdownOpenChange = (isOpen: boolean, userId: string) => {
    if (!isOpen) {
      setOpenDropdownUserId(null);
      if (primedUserId === userId) { // If it was primed and closed without opening fully via second click
         setPrimedUserId(null);
      }
    }
  };


  return (
    <TooltipProvider>
      <div>
        <PageHeader 
          title="User Roles & Permissions" 
          description="Manage users and their access levels within DVPanel."
          actions={AddUserRoleDialog && (
            <AddUserRoleDialog 
              onUserChange={handleUserChange} 
              triggerButton={
                <Button className="shadow-md hover:scale-105 transform transition-transform duration-150">
                  <UserPlus className="mr-2 h-4 w-4" /> Add User
                </Button>
              }
            />
          )}
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
              <CardDescription>All registered users and their assigned roles (excluding the system Owner).</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : users.length === 0 && !error ? (
                <p className="text-center text-muted-foreground py-8">No users found. Add a user to get started.</p>
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
                           <DropdownMenu open={openDropdownUserId === user.id} onOpenChange={(isOpen) => onDropdownOpenChange(isOpen, user.id)}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="shadow-md hover:scale-105 transform transition-transform duration-150"
                                    onClick={() => handleActionButtonClick(user.id)}
                                    ref={el => dropdownMenuRefs.current.set(user.id, el)}
                                  >
                                    {primedUserId === user.id && openDropdownUserId !== user.id ? <Menu className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
                                  </Button>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{primedUserId === user.id && openDropdownUserId !== user.id ? "Click again to open actions" : "View actions"}</p>
                              </TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => { setUserToViewDetails(user); setOpenDropdownUserId(null); setPrimedUserId(null); }}>
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              
                              {AddUserRoleDialog && <AddUserRoleDialog 
                                isEditing={true} 
                                userData={user} 
                                onUserChange={() => { handleUserChange(); setOpenDropdownUserId(null); setPrimedUserId(null); }}
                                triggerButton={
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}> 
                                    <Edit className="mr-2 h-4 w-4" /> Edit User / Role
                                  </DropdownMenuItem>
                                }
                              />}
                              
                              {user.role !== 'Owner' && user.status === 'Active' && ( // Owners cannot be impersonated, inactive users cannot be impersonated
                                <DropdownMenuItem 
                                    onSelect={() => { handleStartImpersonation(user.id); setOpenDropdownUserId(null); setPrimedUserId(null); }}
                                    disabled={isPendingImpersonation}
                                >
                                    {isPendingImpersonation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCog className="mr-2 h-4 w-4" />}
                                    Impersonate User
                                </DropdownMenuItem>
                              )}

                              {user.role !== 'Owner' && ( // Owner cannot be deleted
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground"
                                    onSelect={(e) => { e.preventDefault(); setUserToDelete(user); setOpenDropdownUserId(null); setPrimedUserId(null); }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete User
                                  </DropdownMenuItem>
                                </>
                              )}
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
              {[
                { name: "Owner", description: "Full system access. Managed via .env.local, not listed here." },
                { name: "Administrator", description: "Access to all projects and most system features." },
                { name: "Admin", description: "Assigned to specific projects with full control over them. Customizable page/settings access." },
                { name: "Custom", description: "Granular permissions assigned per module, page, or project." },
              ].map(role => (
                <div key={role.name} className="p-3 border rounded-lg bg-card/50 shadow-sm">
                  <h4 className="font-semibold text-foreground">{role.name}</h4>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        
        <Dialog open={!!userToViewDetails} onOpenChange={(isOpen) => !isOpen && setUserToViewDetails(null)}>
          <DialogCoreContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-2xl backdrop-blur-sm">
            {userToViewDetails && (
              <>
                <DialogCoreHeader>
                  <DialogCoreTitle>Role Details: {userToViewDetails.username}</DialogCoreTitle>
                  <DialogCoreDescription>
                    Viewing permissions and information for role: {userToViewDetails.role}.
                  </DialogCoreDescription>
                </DialogCoreHeader>
                <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  <p><span className="font-semibold text-muted-foreground">Username:</span> {userToViewDetails.username}</p>
                  <p><span className="font-semibold text-muted-foreground">Role:</span> <Badge variant={userToViewDetails.role === 'Administrator' ? 'secondary' : 'outline'}>{userToViewDetails.role}</Badge></p>
                  <p><span className="font-semibold text-muted-foreground">Status:</span> <Badge variant={userToViewDetails.status === 'Active' ? 'default' : 'destructive'} className={userToViewDetails.status === 'Active' ? 'bg-green-500/20 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-500/30' : ''}>{userToViewDetails.status}</Badge></p>
                  
                  {(userToViewDetails.role === 'Admin' || userToViewDetails.role === 'Custom') && userToViewDetails.projects && userToViewDetails.projects.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">Assigned Projects:</h4>
                      <ul className="list-disc list-inside pl-4 text-sm text-muted-foreground">
                        {userToViewDetails.projects.map(pId => <li key={`view-proj-${pId}`}>{findNameById(pId, availableProjects)}</li>)}
                      </ul>
                    </div>
                  )}

                  {userToViewDetails.role === 'Custom' && userToViewDetails.assignedPages && userToViewDetails.assignedPages.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">Accessible Application Pages:</h4>
                      <ul className="list-disc list-inside pl-4 text-sm text-muted-foreground">
                        {userToViewDetails.assignedPages.map(pageId => <li key={`view-page-${pageId}`}>{findNameById(pageId, availableAppPages)}</li>)}
                      </ul>
                    </div>
                  )}
                  
                  {(userToViewDetails.role === 'Administrator' || userToViewDetails.role === 'Admin' || userToViewDetails.role === 'Custom') && userToViewDetails.allowedSettingsPages && userToViewDetails.allowedSettingsPages.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">Accessible Settings Modules:</h4>
                      <ul className="list-disc list-inside pl-4 text-sm text-muted-foreground">
                        {userToViewDetails.allowedSettingsPages.map(settingId => <li key={`view-setting-${settingId}`}>{findNameById(settingId, availableSettingsPages)}</li>)}
                      </ul>
                    </div>
                  )}
                  {(userToViewDetails.role !== 'Owner' && (userToViewDetails.role === 'Admin' || userToViewDetails.role === 'Custom') && (!userToViewDetails.projects || userToViewDetails.projects.length === 0) && (!userToViewDetails.assignedPages || userToViewDetails.assignedPages.length === 0) && (!userToViewDetails.allowedSettingsPages || userToViewDetails.allowedSettingsPages.length === 0)) && (
                    <p className="text-sm text-muted-foreground text-center pt-2">No specific project, page, or settings permissions assigned.</p>
                  )}
                  {userToViewDetails.role === 'Administrator' && (!userToViewDetails.allowedSettingsPages || userToViewDetails.allowedSettingsPages.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center pt-2">No specific settings module permissions assigned. Administrator has implicit access to all application pages and projects.</p>
                  )}
                </div>
                <DialogCoreFooter className="sm:justify-between gap-2 pt-4 border-t">
                  {AddUserRoleDialog && <AddUserRoleDialog 
                      isEditing={true} 
                      userData={userToViewDetails} 
                      onUserChange={handleUserChange}
                      triggerButton={
                          <Button variant="outline" className="shadow-md hover:scale-105 transform transition-transform duration-150">
                              <Edit className="mr-2 h-4 w-4" /> Edit This Role
                          </Button>
                      }
                  />}
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" className="shadow-md hover:scale-105 transform transition-transform duration-150">Close</Button>
                  </DialogClose>
                </DialogCoreFooter>
              </>
            )}
          </DialogCoreContent>
        </Dialog>

        <AlertDialog 
          open={!!userToDelete} 
          onOpenChange={(isOpen) => { 
            if (!isOpen) setUserToDelete(null); 
          }}
        >
          {userToDelete && ( 
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogCoreTitle>Are you absolutely sure?</AlertDialogCoreTitle>
                  <AlertDialogCoreDescription>
                    This action cannot be undone. This will permanently delete the user account for 
                    <span className="font-semibold"> {userToDelete.username}</span> and all associated data files.
                  </AlertDialogCoreDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setUserToDelete(null)} disabled={isPendingDelete}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteUser} disabled={isPendingDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    {isPendingDelete ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Delete User
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
          )}
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
