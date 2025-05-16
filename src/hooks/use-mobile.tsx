
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Custom hook to detect if the current viewport is mobile-sized.
 * It ensures that the initial client-side render matches the server-side assumption (non-mobile)
 * and then updates to the actual client-side status after mounting.
 * @returns {boolean} True if the viewport is mobile-sized, false otherwise.
 */
export function useIsMobile(): boolean {
  // Default to false. This value is used for SSR and initial client render.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // This effect runs only on the client side after the component has mounted.
    const checkDevice = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Call checkDevice on mount to set the initial client-side status.
    checkDevice(); 

    // Add event listener for window resize.
    window.addEventListener('resize', checkDevice);

    // Cleanup function to remove the event listener when the component unmounts.
    return () => window.removeEventListener('resize', checkDevice);
  }, []); // Empty dependency array ensures this effect runs only once on mount and cleans up on unmount.

  return isMobile;
}
