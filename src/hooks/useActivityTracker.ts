
'use client';
import { useEffect, useCallback, useRef } from 'react';
import { updateSessionActivity } from '@/lib/sessionActions';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
const DEBOUNCE_DELAY = 60 * 1000; // 1 minute (e.g., 60 * 1000 ms)

export function useActivityTracker() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityCallRef = useRef<number>(0);

  const handleActivity = useCallback(async () => {
    // console.log('[ActivityTracker] Activity detected, calling updateSessionActivity.');
    try {
      await updateSessionActivity();
      lastActivityCallRef.current = Date.now();
    } catch (error) {
      console.error('[ActivityTracker] Error updating session activity:', error);
    }
  }, []);

  const debouncedActivityHandler = useCallback(() => {
    if (Date.now() - lastActivityCallRef.current < DEBOUNCE_DELAY) {
      // If the last call was too recent, reset the timer but don't call yet
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
    timeoutRef.current = setTimeout(handleActivity, DEBOUNCE_DELAY);
  }, [handleActivity]);

  useEffect(() => {
    // Call immediately on mount to refresh session if user just loaded the page
    // Or to establish initial activity timestamp
    handleActivity();

    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, debouncedActivityHandler);
    });

    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, debouncedActivityHandler);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [debouncedActivityHandler, handleActivity]); // Ensure handleActivity is stable or included if it can change
}
