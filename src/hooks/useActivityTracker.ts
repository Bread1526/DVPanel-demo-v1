
'use client';
import { useEffect, useCallback, useRef } from 'react';
import { touchSession } from '@/lib/sessionActions'; // Assuming new server action
import { type LocalSessionInfo } from '@/lib/session';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
const DEBOUNCE_DELAY = 30 * 1000; // 30 seconds, adjust as needed

export function useActivityTracker() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityCallRef = useRef<number>(0);

  const handleActivity = useCallback(async () => {
    const storedSession = localStorage.getItem('dvpanel-session');
    if (!storedSession) {
        // console.log('[ActivityTracker] No session in localStorage. Not calling touchSession.');
        return;
    }

    try {
        const session: LocalSessionInfo = JSON.parse(storedSession);
        if (session.token && session.username && session.role) {
            // console.log('[ActivityTracker] Activity detected, calling touchSession for user:', session.username);
            await touchSession(session.username, session.role, session.token);
            lastActivityCallRef.current = Date.now();
        } else {
            // console.warn('[ActivityTracker] Incomplete session info in localStorage.');
        }
    } catch (error) {
      console.error('[ActivityTracker] Error processing session or calling touchSession:', error);
    }
  }, []);

  const debouncedActivityHandler = useCallback(() => {
    if (Date.now() - lastActivityCallRef.current < DEBOUNCE_DELAY - 5000) { // -5s buffer
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current); // Clear previous, set new one
    timeoutRef.current = setTimeout(handleActivity, DEBOUNCE_DELAY);
  }, [handleActivity, DEBOUNCE_DELAY]);

  useEffect(() => {
    // Initial call on mount to establish/refresh server-side lastActivity
    // But debounce it slightly to avoid issues on rapid reloads during dev
    const initialActivityTimeout = setTimeout(handleActivity, 5000); 

    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, debouncedActivityHandler);
    });

    return () => {
      clearTimeout(initialActivityTimeout);
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, debouncedActivityHandler);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [debouncedActivityHandler, handleActivity]);
}
