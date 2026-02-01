import { useEffect, useState, useCallback, useRef } from 'react';
import { getMangaProgress, MangaImportProgress } from '@/services/progressService';
import { useSSEProgress } from './useSSEProgress';

interface UseMangaImportProgressOptions {
  enabled?: boolean;
  onProgress?: (progress: MangaImportProgress) => void;
  onComplete?: (progress: MangaImportProgress) => void;
  onError?: (error: string) => void;
}

export function useMangaImportProgress(
  mangaId: number | null,
  options: UseMangaImportProgressOptions = {}
) {
  const { enabled = true, onProgress, onComplete, onError } = options;
  const [progress, setProgress] = useState<MangaImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onProgressRef = useRef<typeof onProgress>(onProgress);
  const onCompleteRef = useRef<typeof onComplete>(onComplete);
  const onErrorRef = useRef<typeof onError>(onError);

  // Keep stable refs for callbacks
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connected':
        console.log('[Import Progress] SSE Connected');
        setError(null);
        break;

      case 'progress':
        setProgress(message.data);
        console.log('[Import Progress] Update:', message.data);
        setError(null);
        // Call onProgress for each update
        if (onProgressRef.current) {
          onProgressRef.current(message.data);
        }
        break;

      case 'no-progress':
        console.log('[Import Progress] No active import');
        setProgress(null);
        break;

      case 'done':
        console.log('[Import Progress] Done:', message.data);
        setProgress(message.data);
        if (message.data.status === 'completed' && onCompleteRef.current) {
          onCompleteRef.current(message.data);
        } else if (message.data.status === 'failed' && onErrorRef.current) {
          onErrorRef.current(message.data.errorMessage || 'Import failed');
        }
        break;
    }
  }, []);

  const handleSSEError = useCallback((err: Error) => {
    console.error('[Import Progress] SSE Error:', err);
    setError('Connection lost, attempting to reconnect...');
  }, []);

  const sseUrl = mangaId ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/manga/progress/${mangaId}/stream` : null;

  useSSEProgress(sseUrl, {
    enabled,
    onMessage: handleMessage,
    onError: handleSSEError,
  });

  // Polling fallback - check progress via REST API if SSE fails
  const checkProgress = useCallback(async () => {
    if (!mangaId) return null;

    try {
      const data = await getMangaProgress(mangaId);
      setProgress(data);
      return data;
    } catch (err) {
      console.error('Failed to check progress:', err);
    }
    return null;
  }, [mangaId]);

  return {
    progress,
    error,
    checkProgress,
  };
}
