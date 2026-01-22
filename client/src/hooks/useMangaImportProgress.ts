import { useEffect, useState, useCallback, useRef } from 'react';
import { getMangaProgress, MangaImportProgress } from '@/services/progressService';
import { useSSEProgress } from './useSSEProgress';

interface UseMangaImportProgressOptions {
  enabled?: boolean;
  onComplete?: (progress: MangaImportProgress) => void;
  onError?: (error: string) => void;
}

export function useMangaImportProgress(
  mangaId: number | null,
  options: UseMangaImportProgressOptions = {}
) {
  const { enabled = true, onComplete, onError } = options;
  const [progress, setProgress] = useState<MangaImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef<typeof onComplete>(onComplete);
  const onErrorRef = useRef<typeof onError>(onError);

  // Keep stable refs for callbacks
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connected':
        setError(null);
        break;

      case 'progress':
        setProgress(message.data);
        setError(null);
        break;

      case 'no-progress':
        setProgress(null);
        break;

      case 'done':
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
