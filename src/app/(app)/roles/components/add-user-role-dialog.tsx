
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
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Check, Loader2, Lock, AlertCircle } from "lucide-react"; // Added AlertCircle
import React, { useState, useEffect, useTransition } from "react";
import { useActionState } from "react";
import { addUser, updateUser } from "../actions";
import type { UserData, UserInput, UserActionState } from "../types";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

// These should ideally come from a shared config or backend
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
  { id: 'roles', name: 'User Roles (/roles)'},
  // Note: Logs are via profile dropdown, not a direct page here for assignment typically
  { id: 'settings_area', name: 'Settings Area (/settings)' }, 
];

const availableSettingsPages = [
  { id: 'settings_general', name: 'General Settings' },
  { id: 'settings_panel', name: 'Panel Settings' }, 
  { id: 'settings_daemon', name: 'Daemon Settings' },
  { id: 'settings_security', name: 'Security Settings' },
  // Popups and Debug settings are user-specific, not assigned via roles
  { id: 'settings_license', name: 'License Settings' },
  { id: 'settings_info', name: 'Info Page' },
];

interface AddUserRoleDialogProps {
  isEditing?: boolean;
  userData?: UserData;
  triggerButton?: React.ReactNode;
  onUserChange?: () => void;
}

const initialFormState: UserActionState = { message: "", status: "idle", errors: {} };

export default function AddUserRoleDialog({ 
  isEditing = false, 
  userData, 
  triggerButton,
  onUserChange 
}: AddUserRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserData["role"] | "">("");
  const [assignedProjects, setAssignedProjects] = useState<string[]>([]);
  const [assignedPages, setAssignedPages] = useState<string[]>([]);
  const [allowedSettingsPages, setAllowedSettingsPages] = useState<string[]>([]);
  const [status, setStatus] = useState<UserData["status"]>("Active");

  const actionToCall = isEditing ? updateUser : addUser;
  const [formState, formAction, isActionStatePending] = useActionState(actionToCall, initialFormState);
  const [isTransitionPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      if (isEditing && userData) {
        setUsername(userData.username);
        setSelectedRole(userData.role);
        setAssignedProjects(userData.projects || []);
        setAssignedPages(userData.assignedPages || []);
        setAllowedSettingsPages(userData.allowedSettingsPages || []);
        setStatus(userData.status || "Active");
        setPassword(""); 
        setConfirmPassword("");
      } else {
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setSelectedRole("");
        setAssignedProjects([]);
        setAssignedPages([]);
        setAllowedSettingsPages([]);
        setStatus("Active");
      }
       // Reset formState when dialog opens/closes or mode changes
      // This ensures previous error messages or success states are cleared.
      // However, useActionState's formState is tied to the action lifecycle.
      // A more direct reset might be needed if errors persist visually across dialog openings.
      // For now, we rely on the re-initialization of local state.
    }
  }, [open, isEditing, userData]);


  useEffect(() => {
    if (formState.status === "success") {
      toast({ title: isEditing ? "User Updated" : "User Added", description: formState.message, duration: 5000 });
      setOpen(false);
      onUserChange?.(); 
    } else if (formState.status === "error" && formState.message && !formState.errors?._form) {
      // Show toast only if there isn't a general _form error already displayed in the Alert
      toast({ title: "Error", description: formState.message, variant: "destructive", duration: 5000 });
    }
  }, [formState, toast, isEditing, onUserChange]);

  const handleProjectToggle = (projectId: string) => {
    setAssignedProjects(prev => 
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handlePageToggle = (pageId: string) => {
    setAssignedPages(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const handleSettingsPageToggle = (pageId: string) => {
    setAllowedSettingsPages(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const handleSubmit = () => {
    if (!isEditing && password !== confirmPassword) {
      toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive", duration: 3000 });
      return;
    }
    if (selectedRole === "") {
        toast({ title: "Role Required", description: "Please select a role for the user.", variant: "destructive", duration: 3000 });
        return;
    }

    const submissionData: UserInput = {
      id: isEditing ? userData?.id : undefined, // Pass ID only for updates
      username,
      role: selectedRole as Exclude<UserData["role"], "Owner">, // Ensure Owner cannot be set via UI 
      projects: assignedProjects,
      assignedPages: assignedPages,
      allowedSettingsPages: allowedSettingsPages,
      status: status,
    };

    if (password && (!isEditing || (isEditing && password))) {
      submissionData.password = password;
    } else if (!isEditing && !password) {
        // If adding new user and password is blank (should be caught by required on input, but good to check)
        toast({ title: "Password Required", description: "Password is required for new users.", variant: "destructive", duration: 3000 });
        return;
    }
    
    startTransition(() => {
      formAction(submissionData);
    });
  };
  
  const TriggerComponent = triggerButton ? React.cloneElement(triggerButton as React.ReactElement, { onClick: () => setOpen(true) }) : (
    <Button className="shadow-md hover:scale-105 transform transition-transform duration-150">
      <UserPlus className="mr-2 h-4 w-4" /> Add User
    </Button>
  );

  // Owner cannot be edited via this dialog in terms of core properties
  const isEditingOwner = isEditing && userData?.role === 'Owner'; 
  // Show customization panel for these roles
  const showCustomizationPanel = selectedRole === "Administrator" || selectedRole === "Admin" || selectedRole === "Custom";
  // Lock project assignment if custom user does not have access to the 'projects_page'
  const projectAssignmentLocked = selectedRole === "Custom" && !assignedPages.includes('projects_page');
  const isPending = isActionStatePending || isTransitionPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {TriggerComponent}
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl rounded-2xl backdrop-blur-sm flex flex-col" 
        style={{ height: 'calc(90vh - 80px)', maxHeight: '700px' }} 
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update user details and role assignments." : "Fill in the details to add a new user and assign their role."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-6 py-4 flex-grow overflow-hidden"> 
          <ScrollArea className="md:w-2/5 w-full flex-shrink-0 pr-3 md:border-r md:border-border">
            <div className="space-y-4 ">
              {formState.status === "error" && formState.errors?._form && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Form Error</AlertTitle>
                  <AlertDescription>{formState.errors._form.join('; ')}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor={`username-${userData?.id || 'new'}`} className="text-right">
                  Username
                </Label>
                <Input 
                  id={`username-${userData?.id || 'new'}`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="john.doe" 
                  className="col-span-2" 
                  disabled={isEditingOwner}
                  required
                />
              </div>
              {formState.errors?.username && <p className="col-start-2 col-span-2 text-xs text-destructive -mt-2">{formState.errors.username.join(', ')}</p>}

              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor={`password-${userData?.id || 'new'}`} className="text-right">
                  Password
                </Label>
                <Input 
                  id={`password-${userData?.id || 'new'}`}
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEditing ? "Leave blank to keep current" : "••••••••"}
                  className="col-span-2" 
                  required={!isEditing}
                />
              </div>
              {formState.errors?.password && <p className="col-start-2 col-span-2 text-xs text-destructive -mt-2">{formState.errors.password.join(', ')}</p>}

              {!isEditing && (
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor={`confirm-password-${userData?.id || 'new'}`} className="text-right">
                    Confirm Pass.
                  </Label>
                  <Input 
                    id={`confirm-password-${userData?.id || 'new'}`} 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" 
                    className="col-span-2" 
                    required={!isEditing}
                  />
                </div>
              )}
              
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor={`role-${userData?.id || 'new'}`} className="text-right">
                  Role
                </Label>
                <Select 
                  value={selectedRole} 
                  onValueChange={(value) => setSelectedRole(value as Exclude<UserData["role"], "Owner">)}
                  disabled={isEditingOwner}
                >
                  <SelectTrigger className="col-span-2" id={`role-${userData?.id || 'new'}`}>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Administrator">Administrator</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formState.errors?.role && <p className="col-start-2 col-span-2 text-xs text-destructive -mt-2">{formState.errors.role.join(', ')}</p>}
              
              {isEditing && !isEditingOwner && (
                <div className="grid grid-cols-3 items-center gap-4 pt-2">
                  <Label htmlFor={`status-${userData?.id || 'new'}`} className="text-right">
                    Status
                  </Label>
                  <Select value={status} onValueChange={(value) => setStatus(value as UserData["status"])} >
                    <SelectTrigger className="col-span-2" id={`status-${userData?.id || 'new'}`}>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {formState.errors?.status && <p className="col-start-2 col-span-2 text-xs text-destructive -mt-2">{formState.errors.status.join(', ')}</p>}
            </div>
          </ScrollArea>

          {showCustomizationPanel && !isEditingOwner && (
            <ScrollArea className="md:w-3/5 w-full flex-grow pl-3">
              <div className="space-y-6">
                {selectedRole === "Custom" && (
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-2">Page Access</h4>
                    <div className="space-y-2 border p-3 rounded-md max-h-48 overflow-y-auto">
                      {availableAppPages.map(page => (
                          <div key={`page-${page.id}-${userData?.id || 'new'}`} className="flex items-center space-x-2">
                              <Checkbox 
                                  id={`page-cb-${page.id}-${userData?.id || 'new'}`}
                                  checked={assignedPages.includes(page.id)}
                                  onCheckedChange={() => handlePageToggle(page.id)}
                              />
                              <Label htmlFor={`page-cb-${page.id}-${userData?.id || 'new'}`} className="font-normal cursor-pointer">{page.name}</Label>
                          </div>
                      ))}
                      {availableAppPages.length === 0 && <p className="text-xs text-muted-foreground">No application pages defined.</p>}
                    </div>
                    {formState.errors?.assignedPages && <p className="text-xs text-destructive text-right mt-1">{(formState.errors.assignedPages as string[]).join(', ')}</p>}
                  </div>
                )}

                {(selectedRole === "Admin" || selectedRole === "Custom") && (
                  <div>
                    <h4 className="font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                      Project Assignments
                      {projectAssignmentLocked && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild><Lock className="h-3 w-3 text-destructive" /></TooltipTrigger>
                            <TooltipContent><p>Assign "Projects Page" access to enable project assignments.</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </h4>
                    <div className={`space-y-2 border p-3 rounded-md max-h-48 overflow-y-auto ${projectAssignmentLocked ? 'opacity-50 cursor-not-allowed bg-muted/50' : ''}`}>
                      {availableProjects.map(project => (
                          <div key={`project-${project.id}-${userData?.id || 'new'}`} className="flex items-center space-x-2">
                              <Checkbox 
                                  id={`project-cb-${project.id}-${userData?.id || 'new'}`}
                                  checked={assignedProjects.includes(project.id)}
                                  onCheckedChange={() => handleProjectToggle(project.id)}
                                  disabled={projectAssignmentLocked}
                              />
                              <Label htmlFor={`project-cb-${project.id}-${userData?.id || 'new'}`} className={`font-normal ${projectAssignmentLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>{project.name}</Label>
                          </div>
                      ))}
                      {availableProjects.length === 0 && <p className="text-xs text-muted-foreground">No projects available.</p>}
                    </div>
                    {formState.errors?.projects && <p className="text-xs text-destructive text-right mt-1">{(formState.errors.projects as string[]).join(', ')}</p>}
                  </div>
                )}
                
                {(selectedRole === "Administrator" || selectedRole === "Admin" || selectedRole === "Custom") && (
                  <div>
                    <Separator className="my-4" />
                    <h4 className="font-semibold text-muted-foreground mb-2">Settings Module Access</h4>
                    <div className="space-y-2 border p-3 rounded-md max-h-48 overflow-y-auto">
                      {availableSettingsPages.map(settingPage => (
                          <div key={`setting-${settingPage.id}-${userData?.id || 'new'}`} className="flex items-center space-x-2">
                              <Checkbox 
                                  id={`setting-cb-${settingPage.id}-${userData?.id || 'new'}`}
                                  checked={allowedSettingsPages.includes(settingPage.id)}
                                  onCheckedChange={() => handleSettingsPageToggle(settingPage.id)}
                              />
                              <Label htmlFor={`setting-cb-${settingPage.id}-${userData?.id || 'new'}`} className="font-normal cursor-pointer">{settingPage.name}</Label>
                          </div>
                      ))}
                      {availableSettingsPages.length === 0 && <p className="text-xs text-muted-foreground">No settings pages defined.</p>}
                    </div>
                     {formState.errors?.allowedSettingsPages && <p className="text-xs text-destructive text-right mt-1">{(formState.errors.allowedSettingsPages as string[]).join(', ')}</p>}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
           {selectedRole && !showCustomizationPanel && !isEditingOwner && (
             <div className="md:w-3/5 w-full flex-grow pl-3 flex items-center justify-center">
                <p className="text-muted-foreground text-center">This role has standard access. <br/>No specific page or project customization is applicable.</p>
             </div>
           )}
           {isEditingOwner && (
              <div className="md:w-3/5 w-full flex-grow pl-3 flex items-center justify-center">
                <p className="text-muted-foreground text-center">The Owner role has full system access. <br/>Core properties cannot be modified via this dialog.</p>
              </div>
           )}
        </div>
        <DialogFooter className="mt-auto pt-4 border-t"> 
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" onClick={handleSubmit} disabled={isPending || isEditingOwner}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {isEditing ? "Save Changes" : "Add User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
