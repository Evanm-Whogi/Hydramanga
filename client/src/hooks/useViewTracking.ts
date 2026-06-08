"use client";
import { useEffect, useRef } from 'react';
import { trackMangaView, trackChapterView } from '@/services/mangaService';
import { trackListView } from '@/services/curatedListService';

/**
 * Hook to track manga view on client-side page mount
 * Only tracks once per component mount to avoid duplicate tracking
 */
export function useMangaViewTracking(mangaId: string | number, mangaTitle?: string, enabled = true) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!enabled || tracked.current) return;
    tracked.current = true;

    (async () => {
      try {
        await trackMangaView(mangaId);
      } catch (err) {
        console.error('Failed to track manga view:', err);
      }
    })();
    
  }, [mangaId, mangaTitle, enabled]);
}

export function useListViewTracking(listId: string | number, enabled = true) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!enabled || tracked.current) return;
    tracked.current = true;

    (async () => {
      try {
        await trackListView(Number(listId));
      } catch (err) {
        console.error('Failed to track list view:', err);
      }
    })();
  }, [listId, enabled]);
}

/**
 * Hook to track chapter view on client-side page mount
 * Only tracks once per component mount to avoid duplicate tracking
 */
export function useChapterViewTracking(mangaId: string | number, chapterId: string | number, mangaTitle?: string, chapterNumber?: string | number, enabled = true) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!enabled || tracked.current || !chapterNumber) return;
    tracked.current = true;

    (async () => {
      try {
        await trackChapterView(mangaId, chapterId);
      } catch (err) {
        console.error('Failed to track chapter view:', err);
      }
    })();
    
  }, [mangaId, chapterId, mangaTitle, chapterNumber, enabled]);
}
