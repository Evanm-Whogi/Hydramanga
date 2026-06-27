'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, X } from 'lucide-react';
import { useNotifications } from '@/providers/NotificationsProvider';
import NavIconTooltip from '@/components/layout/NavIconTooltip';
import type { UserNotification } from '@/services/notificationService';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

type NotificationsMenuProps = {
  /** Desktop navbar: circular icon button. Mobile menu: bordered tile. Profile dropdown: menu row. */
  variant?: 'icon' | 'link' | 'dropdown';
  onOpen?: () => void;
};

export default function NotificationsMenu({ variant = 'icon', onOpen }: NotificationsMenuProps) {
  const isLink = variant === 'link';
  const isDropdown = variant === 'dropdown';
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const { notifications, loading, refresh, dismiss, clearAll } = useNotifications();

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDismiss = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setActingId(id);
    try {
      await dismiss(id);
    } catch {
      await refresh();
    } finally {
      setActingId(null);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearAll();
    } catch {
      await refresh();
    } finally {
      setClearing(false);
    }
  };

  const handleNotificationClick = async (notification: UserNotification) => {
    setIsOpen(false);
    setActingId(notification.id);
    try {
      await dismiss(notification.id);
    } catch {
      await refresh();
    } finally {
      setActingId(null);
    }
    router.push(notification.linkUrl);
  };

  const count = notifications.length;

  const triggerButton = (
    <button
      type="button"
      onClick={() => {
        setIsOpen((open) => {
          if (!open) onOpen?.();
          return !open;
        });
      }}
      aria-label="Notifications"
      aria-expanded={isOpen}
      className={
        isDropdown
          ? 'relative flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-foreground/50 transition-colors focus:outline-none focus:ring-2 focus:ring-borders'
          : isLink
          ? 'relative flex w-full items-center gap-2 rounded-lg border border-borders px-3 py-2 text-sm text-muted hover:bg-foreground/70 focus:outline-none focus:ring-2 focus:ring-borders'
          : 'relative bg-background hover:bg-background/50 p-3 rounded-full focus:outline-none focus:ring-2 focus:ring-borders'
      }
    >
      <BellRing className={isLink || isDropdown ? 'size-4 shrink-0' : 'size-5'} />
      {(isLink || isDropdown) && <span>Notifications</span>}
      {count > 0 && (
        <span
          className={
            isLink || isDropdown
              ? 'ml-auto min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-accent text-background text-[10px] font-bold leading-none'
              : 'absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-accent text-background text-[10px] font-bold leading-none'
          }
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );

  return (
    <div className="relative" ref={rootRef}>
      {variant === 'icon' ? <NavIconTooltip label="Notifications">{triggerButton}</NavIconTooltip> : triggerButton}

      {isOpen && (
        <div className="fixed left-4 right-4 top-24 max-w-md mx-auto xl:absolute xl:left-auto xl:right-0 xl:top-auto xl:mx-0 xl:mt-2 w-auto xl:w-80 sm:xl:w-96 max-h-[min(24rem,70vh)] flex flex-col bg-background border border-borders rounded-xl shadow-xl z-80 animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-borders shrink-0">
            <p className="text-sm font-semibold text-primary">Notifications</p>
            {count > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing}
                className="text-xs text-muted hover:text-primary transition-colors disabled:opacity-50"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted text-center">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted text-center">No notifications</p>
            ) : (
              <ul className="divide-y divide-borders">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(notification)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-foreground/50 transition-colors cursor-pointer group"
                    >
                      <div className={`flex items-start ${notification.type !== 'board_reply' ? 'gap-3' : ''}`}>
                        {notification.type !== 'board_reply' && (
                          <img
                            src={notification.imageUrl || '/notFound.png'}
                            alt=""
                            className="w-10 h-14 shrink-0 rounded object-cover bg-foreground"
                          />
                        )}
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-primary truncate">
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDismiss(e, notification.id)}
                          disabled={actingId === notification.id}
                          aria-label="Dismiss notification"
                          className="shrink-0 p-1 rounded-md text-muted hover:text-primary hover:bg-foreground/80 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          <X className="size-4" />
                        </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
