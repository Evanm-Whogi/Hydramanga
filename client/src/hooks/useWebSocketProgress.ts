"use client";
import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface ProgressMessage {
  type: string;
  data?: any;
}

interface UseWebSocketProgressOptions {
  enabled?: boolean;
  onMessage?: (message: ProgressMessage) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for establishing real-time WebSocket connection to manga progress updates
 * Automatically connects/disconnects based on seriesId changes
 */
export function useWebSocketProgress(
  seriesId: number | null,
  options: UseWebSocketProgressOptions = {}
) {
  const { enabled = true, onMessage, onError } = options;
  const socketRef = useRef<Socket | null>(null);
  const currentSeriesIdRef = useRef<number | null>(null);
  const intentionalDisconnectRef = useRef<boolean>(false);
  const onMessageRef = useRef<typeof onMessage>(onMessage);
  const onErrorRef = useRef<typeof onError>(onError);

  // Keep stable refs for callbacks
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const cleanup = useCallback(() => {
    // Only cleanup if the series ID actually changed (prevents Strict Mode double-invoke)
    if (currentSeriesIdRef.current === seriesId && socketRef.current) {
      return;
    }

    if (socketRef.current) {
      intentionalDisconnectRef.current = true;
      try {
        socketRef.current.disconnect();
      } catch (err) {
        // Silently handle disconnect errors
      }
      socketRef.current = null;
    }
  }, [seriesId]);

  const connect = useCallback(() => {
    if (!seriesId || !enabled) return;
    if (socketRef.current?.connected) return;
    if (socketRef.current) return;

    // Track the series we're connecting to
    currentSeriesIdRef.current = seriesId;

    const socket = io('http://localhost:4000/progress', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      intentionalDisconnectRef.current = false;

      // Subscribe to this series' progress
      socket.emit('subscribe', { seriesId }, (response?: { success: boolean; error?: string; status?: string }) => {
        if (response?.success) {
          // Successfully subscribed
        } else if (onErrorRef.current) {
          onErrorRef.current(new Error(`Failed to subscribe: ${response?.error || 'Unknown error'}`));
        }
      });
    });

    socket.on('progress', (message: ProgressMessage) => {
      try {
        if (onMessageRef.current) {
          onMessageRef.current(message);
        }
      } catch (err) {
        if (onErrorRef.current) {
          onErrorRef.current(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    socket.on('connect_error', (error: any) => {
      if (intentionalDisconnectRef.current) return;

      if (onErrorRef.current) {
        onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
      }
    });

    socket.on('disconnect', (reason: string) => {
      if (intentionalDisconnectRef.current) return;

      // Let socket.io auto-reconnect for common disconnect reasons
      if (reason === 'io client disconnect' || reason === 'io server disconnect') {
        return;
      }

      if (onErrorRef.current) {
        onErrorRef.current(new Error(`WebSocket disconnected: ${reason}`));
      }
    });

    socket.on('error', (error: any) => {
      if (onErrorRef.current && !intentionalDisconnectRef.current) {
        onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, [seriesId, enabled]);

  useEffect(() => {
    if (enabled && seriesId) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [seriesId, enabled, connect, cleanup]);

  return { cleanup };
}
