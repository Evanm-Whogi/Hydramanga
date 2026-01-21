import { useEffect, useState, useCallback, useRef } from 'react';
import { getMangaProgress, MangaImportProgress } from '@/services/progressService';

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
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectingRef = useRef<boolean>(false);
  const terminalRef = useRef<boolean>(false); // completed or failed
  const onCompleteRef = useRef<typeof onComplete>(onComplete);
  const onErrorRef = useRef<typeof onError>(onError);

  // Keep stable refs for callbacks to avoid re-creating connection
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectingRef.current = false;
    terminalRef.current = false;
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!mangaId || !enabled) return;
    if (eventSourceRef.current) return; // already connected/connecting

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const url = `${apiUrl}/manga/progress/${mangaId}/stream`;

    console.log(`[SSE] Connecting to progress stream for manga ${mangaId}`);

    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[SSE] Connected to progress stream for manga ${mangaId}`);
      setIsConnected(true);
      setError(null);
      reconnectingRef.current = false;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            console.log('[SSE] Initial connection established');
            break;

          case 'progress':
            console.log('[SSE] Progress update:', data.data);
            setProgress(data.data);
            break;

          case 'no-progress':
            console.log('[SSE] No active import progress');
            setProgress(null);
            break;

          case 'done':
            console.log('[SSE] Import completed:', data.data);
            setProgress(data.data);
            if (data.data.status === 'completed' && onCompleteRef.current) {
              onCompleteRef.current(data.data);
            } else if (data.data.status === 'failed' && onErrorRef.current) {
              onErrorRef.current(data.data.errorMessage || 'Import failed');
            }
            // Mark terminal state and close connection proactively
            terminalRef.current = true;
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
            break;
        }
      } catch (err) {
        console.error('[SSE] Error parsing message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      setIsConnected(false);
      // If we've reached a terminal state, ignore error and clean up
      if (terminalRef.current) {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        return; // no reconnect
      }

      setError('Connection lost, attempting to reconnect...');

      // Attempt reconnection after 5 seconds (single scheduled)
      if (!reconnectingRef.current) {
        reconnectingRef.current = true;
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[SSE] Attempting to reconnect...');
          reconnectingRef.current = false;
          connect();
        }, 5000);
      }
    };
  }, [mangaId, enabled]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && mangaId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [mangaId, enabled, connect, cleanup]);

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
    isConnected,
    error,
    checkProgress,
    reconnect: connect,
  };
}
