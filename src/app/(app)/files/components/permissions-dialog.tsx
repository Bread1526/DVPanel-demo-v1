
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert'; // Removed AlertTitle

interface PermissionsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetPath: string;
  currentRwxPermissions: string; // e.g., "rwxr-xr-x" or "drwxr-xr-x"
  currentOctalPermissions: string; // e.g., "0755" or "755"
  onPermissionsUpdate: () => void;
}

interface PermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

interface PermissionsState {
  owner: PermissionSet;
  group: PermissionSet;
  others: PermissionSet;
  octal: string; // e.g., "755" or "0755"
}

// Helper to convert octal digit to PermissionSet
const octalDigitToPermissionSet = (digit: number): PermissionSet => ({
  read: (digit & 4) === 4,
  write: (digit & 2) === 2,
  execute: (digit & 1) === 1,
});

// Helper to convert 3-digit or 4-digit octal string to checkbox states
const octalToPermissionsStateCheckboxes = (octal: string): Pick<PermissionsState, 'owner' | 'group' | 'others'> | null => {
  const relevantOctal = octal.length === 4 ? octal.substring(1) : octal;
  if (!/^[0-7]{3}$/.test(relevantOctal)) {
    // console.warn("Invalid octal string for checkbox conversion:", octal);
    return null;
  }
  const ownerDigit = parseInt(relevantOctal[0], 10);
  const groupDigit = parseInt(relevantOctal[1], 10);
  const othersDigit = parseInt(relevantOctal[2], 10);

  return {
    owner: octalDigitToPermissionSet(ownerDigit),
    group: octalDigitToPermissionSet(groupDigit),
    others: octalDigitToPermissionSet(othersDigit),
  };
};

// Helper to convert PermissionSet to octal digit
const permissionSetToOctalDigit = (permSet: PermissionSet): number => {
  let digit = 0;
  if (permSet.read) digit += 4;
  if (permSet.write) digit += 2;
  if (permSet.execute) digit += 1;
  return digit;
};

// Helper to convert checkbox states to 3-digit octal string
const permissionsStateCheckboxesToOctal3 = (state: Pick<PermissionsState, 'owner' | 'group' | 'others'>): string => {
  const ownerDigit = permissionSetToOctalDigit(state.owner);
  const groupDigit = permissionSetToOctalDigit(state.group);
  const othersDigit = permissionSetToOctalDigit(state.others);
  return `${ownerDigit}${groupDigit}${othersDigit}`;
};


export default function PermissionsDialog({
  isOpen,
  onOpenChange,
  targetPath,
  currentRwxPermissions,
  currentOctalPermissions,
  onPermissionsUpdate,
}: PermissionsDialogProps) {
  const [permissions, setPermissions] = useState<PermissionsState>({
    owner: { read: false, write: false, execute: false },
    group: { read: false, write: false, execute: false },
    others: { read: false, write: false, execute: false },
    octal: '000',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const initializePermissions = useCallback((octalPerms: string) => {
    const initialCheckboxState = octalToPermissionsStateCheckboxes(octalPerms);
    if (initialCheckboxState) {
      setPermissions({
        owner: initialCheckboxState.owner,
        group: initialCheckboxState.group,
        others: initialCheckboxState.others,
        octal: octalPerms.padStart(3, '0'), // Ensure it's at least 3 digits for display, allow 4 for SUID/SGID/Sticky
      });
    } else {
      // Fallback if octal parsing fails
      setPermissions({
          owner: { read: false, write: false, execute: false },
          group: { read: false, write: false, execute: false },
          others: { read: false, write: false, execute: false },
          octal: octalPerms || '000'
      });
    }
  }, []);


  useEffect(() => {
    if (isOpen) {
      initializePermissions(currentOctalPermissions);
      setError(null); 
    }
  }, [isOpen, currentOctalPermissions, initializePermissions]);


  const handleCheckboxChange = (type: 'owner' | 'group' | 'others', perm: keyof PermissionSet, checked: boolean) => {
    setPermissions(prev => {
      const newCheckboxState = {
        ...prev,
        [type]: { ...prev[type], [perm]: checked },
      };
      const baseOctal = permissionsStateCheckboxesToOctal3(newCheckboxState);
      // Preserve SUID/SGID/Sticky bit if present from original 4-digit octal
      const prefix = prev.octal.length === 4 ? prev.octal[0] : '';
      newCheckboxState.octal = prefix + baseOctal;
      return newCheckboxState;
    });
  };

  const handleOctalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOctal = e.target.value.replace(/[^0-7]/g, '').slice(0, 4); // Allow up to 4 digits, only 0-7
    setPermissions(prev => {
        const updatedFromOctal = octalToPermissionsStateCheckboxes(newOctal);
        if (updatedFromOctal) {
            return { ...prev, ...updatedFromOctal, octal: newOctal };
        }
        // If input is incomplete (e.g., "7") or invalid for checkboxes, just update octal string
        return { ...prev, octal: newOctal }; 
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    if (!/^[0-7]{3,4}$/.test(permissions.octal) || permissions.octal.length === 0) {
        setError("Octal mode must be 3 or 4 digits (e.g., 755 or 0755).");
        setIsLoading(false);
        return;
    }
    try {
      const response = await fetch('/api/panel-daemon/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, mode: permissions.octal }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to update permissions.');
      }
      toast({ title: 'Success', description: result.message || `Permissions for ${targetPath} updated.` });
      onPermissionsUpdate();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message || 'An unexpected error occurred.');
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };
  
  const renderPermissionCheckboxes = (type: 'owner' | 'group' | 'others', label: string) => (
    <div className="mb-3">
      <Label className="font-semibold">{label}:</Label>
      <div className="flex items-center space-x-4 mt-1">
        {(['read', 'write', 'execute'] as const).map((perm) => (
          <div key={`${type}-${perm}`} className="flex items-center space-x-2">
            <Checkbox
              id={`${type}-${perm}-${targetPath.replace(/[^a-zA-Z0-9]/g, "")}`} // Make ID more unique
              checked={permissions[type][perm]}
              onCheckedChange={(checked) => handleCheckboxChange(type, perm, !!checked)}
            />
            <Label htmlFor={`${type}-${perm}-${targetPath.replace(/[^a-zA-Z0-9]/g, "")}`} className="capitalize text-sm font-normal">{perm}</Label>
          </div>
        ))}
      </div>
    </div>
  );


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Change Permissions</DialogTitle>
          <DialogDescription>
            Target: <span className="font-mono text-sm">{targetPath}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
           <div className="text-sm">
            Current: <span className="font-mono bg-muted px-1 py-0.5 rounded">{currentRwxPermissions} ({currentOctalPermissions})</span>
          </div>

          {renderPermissionCheckboxes('owner', 'Owner')}
          {renderPermissionCheckboxes('group', 'Group')}
          {renderPermissionCheckboxes('others', 'Others')}
          
          <div className="pt-2">
            <Label htmlFor="octal-mode" className="font-semibold">Octal Mode (e.g., 755 or 0755):</Label>
            <Input
              id="octal-mode"
              value={permissions.octal}
              onChange={handleOctalChange}
              placeholder="e.g., 755"
              className="font-mono mt-1"
              maxLength={4}
            />
             {error && (
                <Alert variant="destructive" className="mt-3">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isLoading}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={isLoading} className="shadow-md hover:scale-105 transform transition-transform duration-150">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

