
"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import React, { useEffect, useState } from "react"; // Added useState, useEffect
import type { UserSettingsData, UserPopupSettingsData } from "@/lib/user-settings"; // Import types

export function Toaster() {
  const { toasts } = useToast();

  // Try to get user-specific settings from AppShell context or global state if available
  // For this example, we'll simulate getting it from localStorage on mount.
  // A more robust solution would involve React Context or a global state manager.
  const [popupSettings, setPopupSettings] = useState<UserPopupSettingsData | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    // Attempt to load user-specific settings if available, e.g., from localStorage
    // This is a simplified approach. In a real app, this might come from a user context.
    const storedSettings = localStorage.getItem('dvpanel-user-settings'); // Assuming settings are stored here
    if (storedSettings) {
      try {
        const parsedSettings: UserSettingsData = JSON.parse(storedSettings);
        setPopupSettings(parsedSettings.popup);
      } catch (e) {
        console.warn("Toaster: Could not parse user settings from localStorage", e);
      }
    }
  }, []);

  const getEffectivePopupSetting = <K extends keyof UserPopupSettingsData>(
    key: K, 
    defaultValue: UserPopupSettingsData[K]
  ): UserPopupSettingsData[K] => {
    if (!hasMounted || !popupSettings) {
      // Fallback to localStorage or hardcoded defaults before user settings are loaded
      // This part needs to align with how actual settings are made available globally
      // For now, using a simple localStorage check as a placeholder for broader access
      if (typeof window !== 'undefined') {
        try {
            const lsGlobalSettings = localStorage.getItem('dvpanel-popup-settings'); // Old global settings key
            if(lsGlobalSettings) {
                const parsed = JSON.parse(lsGlobalSettings);
                if (parsed && typeof parsed[key] !== 'undefined') return parsed[key];
            }
        } catch (e) { /* ignore */ }
      }
      return defaultValue;
    }
    return popupSettings[key] ?? defaultValue;
  };


  return (
    <ToastProvider duration={getEffectivePopupSetting('notificationDuration', 5) * 1000}>
      {toasts.map(function ({ id, title, description, action, errorContent, duration: toastSpecificDuration, ...props }) {
        
        const effectiveDisableAutoClose = getEffectivePopupSetting('disableAutoClose', false);
        const effectiveEnableCopyError = getEffectivePopupSetting('enableCopyError', true);

        // Determine the duration to pass to the Radix Toast Root.
        let actualDurationForRadix: number | undefined = toastSpecificDuration;

        if (effectiveDisableAutoClose) {
          actualDurationForRadix = Infinity;
        } else if (typeof toastSpecificDuration !== 'number') {
          // If no specific duration for this toast, let it inherit from ToastProvider
          // The ToastProvider's duration is already set using getEffectivePopupSetting.
          actualDurationForRadix = undefined; 
        }
        
        return (
          <Toast 
            key={id} 
            duration={actualDurationForRadix}
            errorContent={errorContent}
            data-enable-copy-error={String(effectiveEnableCopyError)}
            {...props}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
