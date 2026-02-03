import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent, trackTimeSpent } from '@/lib/analytics';

/**
 * Hook to automatically track page views and time spent on page
 */
export function usePageTracking() {
  const pathname = usePathname();
  const startTimeRef = useRef<number>(Date.now());
  const previousPathRef = useRef<string>('');

  useEffect(() => {
    // Track time spent on previous page
    if (previousPathRef.current && previousPathRef.current !== pathname) {
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (timeSpent > 1) { // Only track if spent more than 1 second
        trackTimeSpent(previousPathRef.current, timeSpent);
      }
    }

    // Track new page view
    trackEvent('page_viewed', {
      path: pathname,
      timestamp: new Date().toISOString(),
    });

    // Reset timer for new page
    startTimeRef.current = Date.now();
    previousPathRef.current = pathname;

    // Cleanup - track time spent when unmounting
    return () => {
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (timeSpent > 1) {
        trackTimeSpent(pathname, timeSpent);
      }
    };
  }, [pathname]);
}

/**
 * Hook to track time spent on a specific component or section
 */
export function useComponentTimeTracking(componentName: string) {
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (timeSpent > 1) {
        trackEvent('component_time_spent', {
          component: componentName,
          seconds: timeSpent,
        });
      }
    };
  }, [componentName]);
}
