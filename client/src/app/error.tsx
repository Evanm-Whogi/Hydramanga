"use client";

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  useEffect(() => {
    // Only log to console in development
    if (isDevelopment) {
      console.error('Global error caught:', error);
    }
  }, [error, isDevelopment]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-primary">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <AlertTriangle className="size-32 text-red-500 animate-pulse" />
              <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
            </div>
          </div>

          <h1 className="text-6xl font-bold mb-3">Error</h1>
          <h2 className="text-3xl font-bold mb-4 text-red-400">Something went wrong</h2>
          <p className="text-lg text-muted mb-8">
            An unexpected error occurred. Our team has been notified.
          </p>

          {/* Only show error details in development */}
          {isDevelopment && error.message && (
            <div className="bg-foreground rounded-lg p-6 mb-8 text-left shadow-lg max-h-48 overflow-y-auto">
              <h3 className="text-sm font-semibold text-red-400 mb-2">Error Details (Dev):</h3>
              <p className="text-sm font-mono text-muted wrap-break-words">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs text-muted mt-2">
                  Error ID: <span className="text-accent">{error.digest}</span>
                </p>
              )}
            </div>
          )}

          {/* Always show error ID in production */}
          {!isDevelopment && error.digest && (
            <div className="bg-foreground rounded-lg p-4 mb-8 text-center">
              <p className="text-xs text-muted">
                Error ID: <span className="text-accent font-mono">{error.digest}</span>
              </p>
              <p className="text-xs text-muted mt-1">Share this ID with support</p>
            </div>
          )}

          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={reset}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors font-semibold"
            >
              <RefreshCw className="size-5" />
              Try Again
            </button>
            <a
              href="/"
              className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary rounded-lg hover:bg-foreground/70 transition-colors font-semibold"
            >
              Go Home
            </a>
          </div>

          <p className="text-sm text-muted mt-8">
            If this error persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}
