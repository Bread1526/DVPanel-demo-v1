
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PermissionsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetPath: string;
  currentPermissions: string; // e.g., "rwxr-xr-x" or "drwxr-xr-x"
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
  octal: string; // e.g., "755"
}

// Helper to convert rwx string to PermissionSet
const rwxToPermissionSet = (rwx: string): PermissionSet => ({
  read: rwx[0] === 'r',
  write: rwx[1] === 'w',
  execute: rwx[2] === 'x',
});

// Helper to convert full permission string to PermissionsState (ignoring directory 'd' bit)
const stringToPermissionsState = (permString: string): Partial<PermissionsState> => {
  const relevantPerms = permString.length === 10 ? permString.substring(1) : permString; // Strip 'd' if present
  if (relevantPerms.length !== 9) {
    console.error("Invalid permission string length:", permString);
    return { octal: "000" }; // Default to a safe, restrictive value
  }
  const owner = rwxToPermissionSet(relevantPerms.substring(0, 3));
  const group = rwxToPermissionSet(relevantPerms.substring(3, 6));
  const others = rwxToPermissionSet(relevantPerms.substring(6, 9));
  return { owner, group, others };
};

// Helper to convert PermissionSet to octal digit
const permissionSetToOctalDigit = (permSet: PermissionSet): number => {
  let digit = 0;
  if (permSet.read) digit += 4;
  if (permSet.write) digit += 2;
  if (permSet.execute) digit += 1;
  return digit;
};

// Helper to convert PermissionsState (checkboxes) to octal string
const permissionsStateToOctal = (state: Pick<PermissionsState, 'owner' | 'group' | 'others'>): string => {
  const ownerDigit = permissionSetToOctalDigit(state.owner);
  const groupDigit = permissionSetToOctalDigit(state.group);
  const othersDigit = permissionSetToOctalDigit(state.others);
  return `${ownerDigit}${groupDigit}${othersDigit}`;
};

// Helper to convert octal digit to PermissionSet
const octalDigitToPermissionSet = (digit: number): PermissionSet => ({
  read: (digit & 4) === 4,
  write: (digit & 2) === 2,
  execute: (digit & 1) === 1,
});

// Helper to convert octal string to full PermissionsState (for checkboxes)
const octalToPermissionsState = (octal: string): Pick<PermissionsState, 'owner' | 'group' | 'others'> | null => {
  if (!/^[0-7]{3}$/.test(octal) && !/^[0-7]{4}$/.test(octal)) {
    console.warn("Invalid octal string for conversion:", octal);
    return null; // Or throw an error
  }
  const relevantOctal = octal.length === 4 ? octal.substring(1) : octal; // Ignore SUID/SGID/Sticky for checkboxes

  const ownerDigit = parseInt(relevantOctal[0], 10);
  const groupDigit = parseInt(relevantOctal[1], 10);
  const othersDigit = parseInt(relevantOctal[2], 10);

  return {
    owner: octalDigitToPermissionSet(ownerDigit),
    group: octalDigitToPermissionSet(groupDigit),
    others: octalDigitToPermissionSet(othersDigit),
  };
};


export default function PermissionsDialog({
  isOpen,
  onOpenChange,
  targetPath,
  currentPermissions,
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

  useEffect(() => {
    if (isOpen) {
      const initialPerms = stringToPermissionsState(currentPermissions);
      if (initialPerms && initialPerms.owner && initialPerms.group && initialPerms.others) {
        const octal = permissionsStateToOctal(initialPerms as Pick<PermissionsState, 'owner' | 'group' | 'others'>);
        setPermissions({
            owner: initialPerms.owner,
            group: initialPerms.group,
            others: initialPerms.others,
            octal: octal,
        });
      } else {
        // Fallback if parsing fails, though currentPermissions should be valid from API
        setPermissions({
            owner: { read: false, write: false, execute: false },
            group: { read: false, write: false, execute: false },
            others: { read: false, write: false, execute: false },
            octal: '000'
        });
      }
      setError(null); // Reset error on open
    }
  }, [isOpen, currentPermissions]);

  const handleCheckboxChange = (type: 'owner' | 'group' | 'others', perm: keyof PermissionSet, checked: boolean) => {
    setPermissions(prev => {
      const newState = {
        ...prev,
        [type]: { ...prev[type], [perm]: checked },
      };
      newState.octal = permissionsStateToOctal(newState);
      return newState;
    });
  };

  const handleOctalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOctal = e.target.value.replace(/[^0-7]/g, '').slice(0, 4); // Allow up to 4 digits, only 0-7
    setPermissions(prev => {
        let updatedFromOctal = octalToPermissionsState(newOctal.length >= 3 ? newOctal.slice(-3) : "000"); // Use last 3 digits for checkboxes
        if (updatedFromOctal) {
            return { ...prev, ...updatedFromOctal, octal: newOctal };
        }
        return { ...prev, octal: newOctal }; // Only update octal if parsing fails for checkboxes
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    if (!/^[0-7]{3,4}$/.test(permissions.octal)) {
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
              id={`${type}-${perm}`}
              checked={permissions[type][perm]}
              onCheckedChange={(checked) => handleCheckboxChange(type, perm, !!checked)}
            />
            <Label htmlFor={`${type}-${perm}`} className="capitalize text-sm font-normal">{perm}</Label>
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
            Current: <span className="font-mono bg-muted px-1 py-0.5 rounded">{currentPermissions} ({permissions.octal ? '0' + permissions.octal : 'N/A'})</span>
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
             {error && !error.includes("Octal mode must be 3 or 4 digits") && ( // Only show general errors here
                <Alert variant="destructive" className="mt-3">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {error && error.includes("Octal mode must be 3 or 4 digits") && (
                 <p className="text-xs text-destructive mt-1">{error}</p>
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

