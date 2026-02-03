'use client';

import posthog from 'posthog-js';
import { ReactNode, useEffect, useState } from 'react';

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    
    if (!posthogKey) {
      console.warn('PostHog: No API key provided, analytics will be disabled.');
      return;
    }

    // Check if already initialized
    if (posthog.__loaded) {
      setIsInitialized(true);
      return;
    }

    // Initialize PostHog
    posthog.init(posthogKey, {
      api_host: '/api/_analytics', // Proxy through our own API route
      ui_host: 'https://app.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false, // We'll handle this manually
      capture_pageleave: true,
      disable_external_dependency_loading: true, // Load everything through proxy to avoid ad blockers
      loaded: (ph) => {
        setIsInitialized(true);
      },
    });
  }, []);

  return <>{children}</>;
}

export default PostHogProvider;
