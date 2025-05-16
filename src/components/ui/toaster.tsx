
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

export function Toaster() {
  const { toasts } = useToast()

  // These settings would ideally come from a global context or settings store
  // For now, using placeholders or assuming they might be passed via toast data if needed
  const placeholderSettings = {
    popup: {
      enableCopyError: true, // Default to true for demonstration
      disableAutoClose: false, // Default to false
    }
  };


  return (
    <ToastProvider duration={5000}> {/* Default duration for provider */}
      {toasts.map(function ({ id, title, description, action, errorContent, duration, ...props }) {
        
        // Determine actual duration: if disableAutoClose is true, duration is Infinity.
        // Otherwise, use toast-specific duration or provider default.
        const actualDuration = placeholderSettings.popup.disableAutoClose ? Infinity : duration;
        
        return (
          <Toast 
            key={id} 
            duration={actualDuration} 
            errorContent={errorContent}
            data-enable-copy-error={placeholderSettings.popup.enableCopyError ? "true" : "false"}
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
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
