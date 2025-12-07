import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user is on a mobile/touch device
 * Uses multiple detection methods for reliability
 */
export const useMobileDetection = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // SSR safety - return false during server-side rendering
    if (typeof window === 'undefined') {
      return false;
    }
    
    // Initial detection using multiple methods
    return detectMobile();
  });

  useEffect(() => {
    // Re-check on mount and when media queries change
    const checkMobile = () => {
      setIsMobile(detectMobile());
    };

    // Listen for changes in pointer capability (e.g., tablet rotation, external mouse)
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', checkMobile);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(checkMobile);
    }

    // Also check on resize (some devices may change behavior)
    window.addEventListener('resize', checkMobile);

    // Initial check
    checkMobile();

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', checkMobile);
      } else {
        mediaQuery.removeListener(checkMobile);
      }
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return isMobile;
};

/**
 * Detect if the current device is a mobile/touch device
 */
function detectMobile(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Method 1: Check for touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Method 2: Check pointer type (coarse = finger/touch, fine = mouse)
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

  // Method 3: Check if it's a touch-only device (no fine pointer)
  const hasNoFinePointer = !window.matchMedia('(pointer: fine)').matches;

  // Method 4: Check screen width (fallback)
  const isSmallScreen = window.innerWidth <= 768;

  // Method 5: User agent check (less reliable but useful for edge cases)
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  // Consider it mobile if:
  // - Has coarse pointer (primary input is touch) OR
  // - Has touch AND no fine pointer AND small screen OR
  // - Mobile user agent AND has touch
  return hasCoarsePointer || (hasTouch && hasNoFinePointer && isSmallScreen) || (mobileUserAgent && hasTouch);
}

export default useMobileDetection;

