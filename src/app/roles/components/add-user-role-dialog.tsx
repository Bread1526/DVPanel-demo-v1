
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
import { UserPlus, Check, Loader2 } from "lucide-react";
import React, { useState, useEffect, useTransition } from "react";
import { useFormState } from "react-dom";
import { type UserData, type UserInput, addUser, updateUser, type UserActionState } from "../actions";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const availableProjects = [ // This should ideally come from a service or props
  { id: 'project_ecommerce_api', name: 'E-commerce API'},
  { id: 'project_company_website', name: 'Company Website'},
  { id: 'project_data_worker', name: 'Data Processing Worker'},
  { id: 'project_blog_platform', name: 'Blog Platform'},
];

interface AddUserRoleDialogProps {
  isEditing?: boolean;
  userData?: UserData; // Full UserData for editing
  triggerButton?: React.ReactNode;
  onUserChange?: () => void; // Callback to refresh user list
}

const initialFormState: UserActionState = { message: "", status: "idle" };

export default function AddUserRoleDialog({ 
  isEditing = false, 
  userData, 
  triggerButton,
  onUserChange 
}: AddUserRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserData["role"] | "">("");
  const [assignedProjects, setAssignedProjects] = useState<string[]>([]);
  const [status, setStatus] = useState<UserData["status"]>("Active");

  const actionToCall = isEditing ? updateUser : addUser;
  const [formState, formAction] = useFormState(actionToCall, initialFormState);
  const [isTransitionPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      if (isEditing && userData) {
        setUsername(userData.username);
        setEmail(userData.email);
        setSelectedRole(userData.role);
        setAssignedProjects(userData.projects || []);
        setStatus(userData.status || "Active");
        setPassword(""); 
        setConfirmPassword("");
      } else {
        // Reset for new user
        setUsername("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setSelectedRole("");
        setAssignedProjects([]);
        setStatus("Active");
      }
       // Reset formState when dialog opens
      if (formState.status !== 'idle') {
        // This is a bit of a hack to reset formState if it's not idle.
        // A better approach might involve a dedicated reset action or keying the form.
        actionToCall(initialFormState, {} as UserInput); 
      }
    }
  }, [open, isEditing, userData, formState.status, actionToCall]);


  useEffect(() => {
    if (formState.status === "success") {
      toast({ title: isEditing ? "User Updated" : "User Added", description: formState.message, duration: 5000 });
      setOpen(false);
      onUserChange?.(); // Trigger refresh
    } else if (formState.status === "error" && formState.message) {
      toast({ title: "Error", description: formState.message, variant: "destructive", duration: 5000 });
    }
  }, [formState, toast, isEditing, onUserChange]);

  const handleProjectToggle = (projectId: string) => {
    setAssignedProjects(prev => 
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSubmit = () => {
    if (!isEditing && password !== confirmPassword) {
      toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive", duration: 3000 });
      return;
    }

    const submissionData: UserInput = {
      id: isEditing ? userData?.id : undefined,
      username,
      email,
      role: selectedRole as UserData["role"], // Assuming selectedRole is validated by this point or by Zod
      projects: assignedProjects,
      status: status,
    };
    if (password) { // Only include password if it's set (for new user or if changing)
      submissionData.password = password;
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

  const isOwnerEditing = isEditing && userData?.username === 'root_owner'; // Example 'root_owner' check

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {TriggerComponent}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px] rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update user details and role assignments." : "Fill in the details to add a new user and assign their role."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          {formState.status === "error" && formState.errors?._form && (
            <Alert variant="destructive">
              <AlertTitle>Form Error</AlertTitle>
              <AlertDescription>{formState.errors._form.join(', ')}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input 
              id="username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="john.doe" 
              className="col-span-3" 
              disabled={isOwnerEditing}
            />
          </div>
          {formState.errors?.username && <p className="col-span-4 text-xs text-destructive text-right -mt-2">{formState.errors.username.join(', ')}</p>}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input 
              id="email" 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com" 
              className="col-span-3" 
            />
          </div>
          {formState.errors?.email && <p className="col-span-4 text-xs text-destructive text-right -mt-2">{formState.errors.email.join(', ')}</p>}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="password" className="text-right">
              Password
            </Label>
            <Input 
              id="password" 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEditing ? "Leave blank to keep current" : "••••••••"}
              className="col-span-3" 
            />
          </div>
          {formState.errors?.password && <p className="col-span-4 text-xs text-destructive text-right -mt-2">{formState.errors.password.join(', ')}</p>}

          {!isEditing && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="confirm-password" className="text-right">
                Confirm Pass.
              </Label>
              <Input 
                id="confirm-password" 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••" 
                className="col-span-3" 
              />
            </div>
          )}
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <Select 
              value={selectedRole} 
              onValueChange={(value) => setSelectedRole(value as UserData["role"])}
              disabled={isOwnerEditing}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Administrator">Administrator</SelectItem>
                <SelectItem value="Admin">Admin (Project-specific)</SelectItem>
                <SelectItem value="Custom">Custom (Project-specific)</SelectItem>
              </SelectContent>
            </Select>
          </div>
           {formState.errors?.role && <p className="col-span-4 text-xs text-destructive text-right -mt-2">{formState.errors.role.join(', ')}</p>}


          {(selectedRole === "Admin" || selectedRole === "Custom") && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">
                Projects
              </Label>
              <div className="col-span-3 space-y-2 border p-3 rounded-md max-h-32 overflow-y-auto">
                {availableProjects.map(project => (
                    <div key={project.id} className="flex items-center space-x-2">
                        <Checkbox 
                            id={`project-${project.id}-${userData?.id || 'new'}`}
                            checked={assignedProjects.includes(project.id)}
                            onCheckedChange={() => handleProjectToggle(project.id)}
                        />
                        <Label htmlFor={`project-${project.id}-${userData?.id || 'new'}`} className="font-normal cursor-pointer">{project.name}</Label>
                    </div>
                ))}
                 {availableProjects.length === 0 && <p className="text-xs text-muted-foreground">No projects available for assignment.</p>}
              </div>
            </div>
          )}
          {formState.errors?.projects && <p className="col-span-4 text-xs text-destructive text-right -mt-2">{formState.errors.projects.join(', ')}</p>}


           {isEditing && !isOwnerEditing && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <Select value={status} onValueChange={(value) => setStatus(value as UserData["status"])}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {formState.errors?.status && <p className="col-span-4 text-xs text-destructive text-right -mt-2">{formState.errors.status.join(', ')}</p>}


        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isTransitionPending}>Cancel</Button>
          <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" onClick={handleSubmit} disabled={isTransitionPending}>
            {isTransitionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {isEditing ? "Save Changes" : "Add User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
