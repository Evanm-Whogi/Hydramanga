'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { isRateLimitError } from '@/lib/rateLimit';

export function useSubmitRateLimit() {
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);

  const isRateLimited =
    rateLimitedUntil !== null && Date.now() < rateLimitedUntil;

  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const remaining = rateLimitedUntil - Date.now();
    if (remaining <= 0) {
      setRateLimitedUntil(null);
      return;
    }
    const timer = setTimeout(() => setRateLimitedUntil(null), remaining);
    return () => clearTimeout(timer);
  }, [rateLimitedUntil]);

  const applyRateLimitFromError = useCallback((error: unknown): boolean => {
    if (!isRateLimitError(error)) return false;
    setRateLimitedUntil(Date.now() + error.retryAfterMs);
    toast.warning(error.message);
    return true;
  }, []);

  const rateLimitSecondsLeft =
    isRateLimited && rateLimitedUntil
      ? Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000))
      : 0;

  return {
    isRateLimited,
    applyRateLimitFromError,
    rateLimitSecondsLeft,
  };
}
