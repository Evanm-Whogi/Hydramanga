'use client';

import { usePageTracking } from '@/hooks/usePageTracking';

export function PageTrackingProvider({ children }: { children: React.ReactNode }) {
  usePageTracking();
  return <>{children}</>;
}
