import { useEffect, useState, useCallback, useRef } from 'react';
import { getMangaProgress, MangaImportProgress } from '@/services/progressService';
import { useWebSocketProgress } from './useWebSocketProgress';

interface UseMangaImportProgressOptions {
  enabled?: boolean;
  mangaTitle?: string;
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
  const { enabled = true, mangaTitle, onProgress, onComplete, onError } = options;
  const [progress, setProgress] = useState<MangaImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onProgressRef = useRef<typeof onProgress>(onProgress);
  const onCompleteRef = useRef<typeof onComplete>(onComplete);
  const onErrorRef = useRef<typeof onError>(onError);
  const lastTrackedPercentageRef = useRef<number>(0);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onProgress, onComplete, onError]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'progress':
        setProgress(message.data);
        setError(null);
        
        if (message.data?.downloadedChapters !== undefined && message.data?.totalChapters !== undefined) {
          const percentage = Math.round((message.data.downloadedChapters / message.data.totalChapters) * 100);
          const milestones = [0, 25, 50, 75];
          if (milestones.includes(percentage) && percentage !== lastTrackedPercentageRef.current) {
            lastTrackedPercentageRef.current = percentage;
          }
        }
        
        if (onProgressRef.current) {
          onProgressRef.current(message.data);
        }
        break;

      case 'no-progress':
        setProgress(null);
        lastTrackedPercentageRef.current = 0;
        break;

      case 'done':
        setProgress(message.data);
        if (message.data?.status === 'completed' && onCompleteRef.current) {
          if (message.data?.downloadedChapters !== undefined && message.data?.totalChapters !== undefined) {
            lastTrackedPercentageRef.current = 0;
          }
          onCompleteRef.current(message.data);
        } else if (message.data?.status === 'failed' && onErrorRef.current) {
          if (message.data?.downloadedChapters !== undefined && message.data?.totalChapters !== undefined) {
            lastTrackedPercentageRef.current = 0;
          }
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
