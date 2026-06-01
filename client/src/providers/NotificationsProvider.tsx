"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearAllNotifications, dismissNotification, getNotifications, type NotificationsResponse, type UserNotification } from '@/services/notificationService';
import { useUser } from '@/providers/UserProvider';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';

const POLL_INTERVAL_MS = 120_000;

type NotificationsContextType = {
  notifications: UserNotification[];
  loading: boolean;
  refresh: () => Promise<void>;
  dismiss: (id: number) => Promise<NotificationsResponse>;
  clearAll: () => Promise<NotificationsResponse>;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data.notifications ?? []);
    } catch {
      setNotifications([]);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    void refresh();
  }, [user, refresh]);

  useVisibilityAwareInterval(() => { void refresh(); }, POLL_INTERVAL_MS, Boolean(user));

  const dismiss = useCallback(async (id: number) => {
    const data = await dismissNotification(id);
    setNotifications(data.notifications ?? []);
    return data;
  }, []);

  const clearAll = useCallback(async () => {
    const data = await clearAllNotifications();
    setNotifications(data.notifications ?? []);
    return data;
  }, []);

  const value = useMemo(() => ({ notifications, loading, refresh, dismiss, clearAll }), [notifications, loading, refresh, dismiss, clearAll]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
