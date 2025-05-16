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
import { UserPlus, Check } from "lucide-react";
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";

const availableProjects = [
  { id: '1', name: 'E-commerce API'},
  { id: '2', name: 'Company Website'},
  { id: '3', name: 'Data Processing Worker'},
  { id: '4', name: 'Blog Platform'},
];


export default function AddUserRoleDialog({isEditing = false, userData}: {isEditing?: boolean, userData?: any}) {
  const [open, setOpen] = React.useState(false);
  const [selectedRole, setSelectedRole] = React.useState(userData?.role || "");
  const [assignedProjects, setAssignedProjects] = React.useState<string[]>(userData?.projects || []);

  const handleProjectToggle = (projectId: string) => {
    setAssignedProjects(prev => 
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
         {isEditing ? (
            <Button variant="ghost" size="sm">Edit</Button>
         ) : (
            <Button className="shadow-md hover:scale-105 transform transition-transform duration-150">
                <UserPlus className="mr-2 h-4 w-4" /> Add User
            </Button>
         )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px] rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update user details and role assignments." : "Fill in the details to add a new user and assign their role."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input id="username" defaultValue={userData?.username} placeholder="john.doe" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input id="email" type="email" defaultValue={userData?.email} placeholder="user@example.com" className="col-span-3" />
          </div>
          {!isEditing && (
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="text-right">
                Password
                </Label>
                <Input id="password" type="password" placeholder="••••••••" className="col-span-3" />
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Administrator">Administrator</SelectItem>
                <SelectItem value="Admin">Admin (Project-specific)</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(selectedRole === "Admin" || selectedRole === "Custom") && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">
                Assignable Projects
              </Label>
              <div className="col-span-3 space-y-2 border p-3 rounded-md max-h-48 overflow-y-auto">
                {availableProjects.map(project => (
                    <div key={project.id} className="flex items-center space-x-2">
                        <Checkbox 
                            id={`project-${project.id}`} 
                            checked={assignedProjects.includes(project.id)}
                            onCheckedChange={() => handleProjectToggle(project.id)}
                        />
                        <Label htmlFor={`project-${project.id}`} className="font-normal cursor-pointer">{project.name}</Label>
                    </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" className="shadow-md hover:scale-105 transform transition-transform duration-150" onClick={() => setOpen(false)}>
            <Check className="mr-2 h-4 w-4" /> {isEditing ? "Save Changes" : "Add User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
