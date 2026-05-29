"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "@/providers/UserProvider";
import { getWebSocketBase } from "@/lib/env";

export interface ChatSocketEvent {
  type: string;
  data?: unknown;
}

export type ChatPresenceUser = {
  id: string;
  name: string;
  username?: string | null;
  displayUsername?: string | null;
  image: string | null;
  role: string;
};

export function useChatSocket(onEvent: (event: ChatSocketEvent) => void, enabled = true) {
  const { session, user } = useUser();
  const socketRef = useRef<Socket | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !session || !user?.id) return;

    // withCredentials forwards the session cookie so the server can authenticate
    // the connection and derive identity itself (no client-supplied identity is trusted).
    const socket = io(`${getWebSocketBase()}/chat`, {
      reconnection: true,
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("chat", (payload: ChatSocketEvent) => {
      onEventRef.current(payload);
    });

    return () => {
      disconnect();
    };
  }, [enabled, session, user?.id, user?.name, user?.image, user?.role, disconnect]);

  return { disconnect };
}
