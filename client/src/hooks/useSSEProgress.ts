import { useEffect, useCallback, useRef } from 'react';

interface UseSSEProgressOptions {
  enabled?: boolean;
  onMessage?: (message: any) => void;
  onError?: (error: Error) => void;
}

export function useSSEProgress(
  url: string | null,
  options: UseSSEProgressOptions = {}
) {
  const { enabled = true, onMessage, onError } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectingRef = useRef<boolean>(false);
  const terminalRef = useRef<boolean>(false);
  const onMessageRef = useRef<typeof onMessage>(onMessage);
  const onErrorRef = useRef<typeof onError>(onError);

  // Keep stable refs for callbacks
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
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
  }, []);

  const connect = useCallback(() => {
    if (!url || !enabled) return;
    if (eventSourceRef.current) return; // already connected

    console.log('[SSE] Connecting to', url);

    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      reconnectingRef.current = false;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log(data)
        
        // Check if this is a terminal state (done/completed/failed)
        if (data.type === 'done' || data.status === 'completed' || data.status === 'failed') {
          terminalRef.current = true;
          if (onMessageRef.current) onMessageRef.current(data);
          // Close connection immediately to avoid error on server close
          cleanup();
        } else if (onMessageRef.current) {
          onMessageRef.current(data);
        }
      } catch (err) {
        console.error('[SSE] Error parsing message:', err);
        if (onErrorRef.current) {
          onErrorRef.current(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    eventSource.onerror = () => {
      console.error('[SSE] Connection error');
      
      // If terminal state reached, don't reconnect
      if (terminalRef.current) {
        cleanup();
        return;
      }

      // Attempt reconnection after 5 seconds
      if (!reconnectingRef.current) {
        reconnectingRef.current = true;
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectingRef.current = false;
          connect();
        }, 5000);
      }
    };
  }, [url, enabled, cleanup]);

  useEffect(() => {
    if (enabled && url) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [url, enabled, connect, cleanup]);

  return { cleanup };
}
