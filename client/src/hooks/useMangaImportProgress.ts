import { useEffect, useState, useCallback, useRef } from 'react';
import { getMangaProgress, MangaImportProgress } from '@/services/progressService';
import { useWebSocketProgress } from './useWebSocketProgress';

interface UseMangaImportProgressOptions {
  enabled?: boolean;
  onProgress?: (progress: MangaImportProgress) => void;
  onComplete?: (progress: MangaImportProgress) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for tracking manga import progress via WebSocket
 * Updates state when progress messages arrive and provides callbacks for different states
 */
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
      case 'progress':
        setProgress(message.data);
        setError(null);
        if (onProgressRef.current) {
          onProgressRef.current(message.data);
        }
        break;

      case 'no-progress':
        setProgress(null);
        break;

      case 'done':
        setProgress(message.data);
        if (message.data?.status === 'completed' && onCompleteRef.current) {
          onCompleteRef.current(message.data);
        } else if (message.data?.status === 'failed' && onErrorRef.current) {
          onErrorRef.current(message.data?.errorMessage || 'Import failed');
        }
        break;
    }
  }, []);

  const handleWebSocketError = useCallback((err: Error) => {
    setError('Connection lost, attempting to reconnect...');
  }, []);

  useWebSocketProgress(mangaId, {
    enabled,
    onMessage: handleMessage,
    onError: handleWebSocketError,
  });

  return {
    progress,
    error,
  };
}
