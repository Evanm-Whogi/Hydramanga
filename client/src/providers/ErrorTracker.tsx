"use client";

import { useEffect } from 'react';
import { trackError } from '@/lib/analytics';
import { shouldTrackError } from '@/lib/errorSanitizer';

interface ErrorTrackerProps {
  children: React.ReactNode;
}

export default function ErrorTracker({ children }: ErrorTrackerProps) {
  useEffect(() => {
    // Track unhandled errors
    const handleError = (event: ErrorEvent) => {
      // Only track if it passes filtering (avoid noisy errors)
      if (!shouldTrackError(event.message || '', 'UnhandledError')) {
        return;
      }

      trackError(
        event.message || 'Unhandled error',
        'UnhandledError',
        event.error?.stack,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      );
    };

    // Track unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      
      // Filter noisy errors
      if (!shouldTrackError(errorMessage, 'UnhandledPromiseRejection')) {
        return;
      }

      trackError(
        errorMessage || 'Unhandled promise rejection',
        'UnhandledPromiseRejection',
        reason instanceof Error ? reason.stack : undefined,
        {
          reason: String(reason),
        }
      );
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}
