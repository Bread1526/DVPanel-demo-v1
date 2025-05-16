
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
import React from "react";

export function Toaster() {
  const { toasts } = useToast();

  const [popupSettings, setPopupSettings] = React.useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedSettings = localStorage.getItem('dvpanel-popup-settings');
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          return {
            disableAutoClose: parsed.disableAutoClose ?? false,
            enableCopyError: parsed.enableCopyError ?? true, 
          };
        }
      } catch (error) {
        console.warn("Could not parse popup settings from localStorage", error);
      }
    }
    // Fallback defaults if localStorage is unavailable or invalid
    return { 
      disableAutoClose: false,
      enableCopyError: true, 
    };
  });

  return (
    <ToastProvider duration={5000}> {/* This is the provider's default if individual toast duration is undefined */}
      {toasts.map(function ({ id, title, description, action, errorContent, duration: toastSpecificDuration, ...props }) {
        
        // Determine the duration to pass to the Radix Toast Root.
        // If disableAutoClose is true, duration is Infinity.
        // Otherwise, use the specific duration for this toast if provided.
        // If toastSpecificDuration is undefined, Toast.Root will inherit from ToastProvider.
        const actualDurationForRadix = popupSettings.disableAutoClose 
          ? Infinity 
          : toastSpecificDuration; 
        
        // console.log(`[Toaster.tsx] Toast ID: ${id}, disableAutoClose: ${popupSettings.disableAutoClose}, toastSpecificDuration: ${toastSpecificDuration}, actualDurationForRadix: ${actualDurationForRadix}`);

        return (
          <Toast 
            key={id} 
            duration={actualDurationForRadix} // Pass this to the Toast component
            errorContent={errorContent}
            data-enable-copy-error={String(popupSettings.enableCopyError)}
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
