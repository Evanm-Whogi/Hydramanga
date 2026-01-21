"use client";
import { useEffect, useRef } from 'react';
import { getClientApiBase } from '@/lib/env';

/**
 * Hook to track manga view on client-side page mount
 * Only tracks once per component mount to avoid duplicate tracking
 */
export function useMangaViewTracking(mangaId: string | number) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    // Track view via client-side API call - await to ensure cache is invalidated before stats are fetched
    (async () => {
      try {
        await fetch(`${getClientApiBase()}/manga/${mangaId}/track-view`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (err) {
        console.error('Failed to track manga view:', err);
      }
    })();
  }, [mangaId]);
}

/**
 * Hook to track chapter view on client-side page mount
 * Only tracks once per component mount to avoid duplicate tracking
 */
export function useChapterViewTracking(mangaId: string | number, chapterId: string | number) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    // Track view via client-side API call - await to ensure cache is invalidated before stats are fetched
    (async () => {
      try {
        await fetch(`${getClientApiBase()}/manga/${mangaId}/chapter/${chapterId}/track-view`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (err) {
        console.error('Failed to track chapter view:', err);
      }
    })();
  }, [mangaId, chapterId]);
}
