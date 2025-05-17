// src/lib/session.ts

// Define a type for the user object stored in localStorage and used for API requests
export type LocalSessionInfo = {
  userId: string;
  username: string;
  role: string; // UserData['role'] | 'Owner'
  token: string;
};

// Define a type for the data stored in the encrypted session file (e.g., {username}-{role}-Auth.json)
export type FileSessionData = {
  userId: string;
  username: string;
  role: string; // UserData['role'] | 'Owner'
  token: string; // The session token
  createdAt: number; // Timestamp of session creation
  lastActivity: number; // Timestamp of last recorded activity
  // Session-specific inactivity settings, copied from global settings at session creation
  sessionInactivityTimeoutMinutes: number; 
  disableAutoLogoutOnInactivity: boolean;
};

// Type for basic user info used in AppShell state after successful auth
export type AuthenticatedUser = {
  id: string;
  username: string;
  role: string; // UserData['role'] | 'Owner';
  // These will be populated from the main user file (e.g., {username}-{role}.json), not the -Auth.json file
  projects?: string[];
  assignedPages?: string[];
  allowedSettingsPages?: string[];
  status?: 'Active' | 'Inactive';
};

// This file no longer exports iron-session options as we're moving to a custom file-based system.
// If iron-session is completely removed, ensure its dependencies are also cleaned up from package.json eventually.
