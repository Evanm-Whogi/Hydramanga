'use client';
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useTransition, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useUser } from '@/providers/UserProvider';
import { getSettings, updateSettings } from '@/services/userService';
import { getGuestHideNsfw, setGuestHideNsfw } from '@/lib/nsfwPreference';
import { toastApiError } from '@/lib/rateLimit';

interface NsfwContextType {
  /** Whether 18+ content is currently hidden. Defaults to hidden. */
  hideNsfw: boolean;
  /** Increments on every change so client-fetched lists can re-fetch live. */
  revision: number;
  /** True while content is being refreshed after a toggle (non-blocking). */
  pending: boolean;
  toggle: () => void;
}

const NsfwContext = createContext<NsfwContextType | undefined>(undefined);

/**
 * Source of truth for the NSFW preference on the client.
 * - Logged in: backed by the account's "Hide NSFW content" setting.
 * - Guest: backed by the {@link getGuestHideNsfw} cookie.
 * Toggling flips the control immediately (optimistic), then bumps
 * {@link NsfwContextType.revision} so client-side lists re-fetch and calls
 * router.refresh() so server-rendered surfaces update — both inside a transition
 * so the rest of the UI stays responsive.
 */
export function NsfwProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useUser();
  const [hideNsfw, setHideNsfw] = useState(true);
  const [revision, setRevision] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    if (user) {
      getSettings()
        .then((s) => { if (active) setHideNsfw(s.hideNsfw); })
        .catch(() => { if (active) setHideNsfw(true); });
    } else {
      setHideNsfw(getGuestHideNsfw());
    }
    return () => { active = false; };
  }, [user]);

  const propagate = useCallback(() => {
    startTransition(() => {
      setRevision((r) => r + 1);
      router.refresh();
    });
  }, [router]);

  const toggle = useCallback(() => {
    const next = !hideNsfw;
    // Flip the control immediately so it never feels laggy.
    setHideNsfw(next);
    toast.success(next ? '18+ content hidden' : '18+ content visible');

    if (user) {
      // Client lists re-read the saved setting from the server, so the write
      // must land before we refetch.
      updateSettings({ hideNsfw: next })
        .then(propagate)
        .catch((error) => {
          setHideNsfw(!next); // revert on failure
          toastApiError(error, 'Failed to update setting');
        });
    } else {
      setGuestHideNsfw(next);
      propagate();
    }
  }, [hideNsfw, user, propagate]);

  const value = useMemo(
    () => ({ hideNsfw, revision, pending, toggle }),
    [hideNsfw, revision, pending, toggle],
  );

  return <NsfwContext.Provider value={value}>{children}</NsfwContext.Provider>;
}

export function useNsfw(): NsfwContextType {
  const ctx = useContext(NsfwContext);
  if (!ctx) throw new Error('useNsfw must be used within an NsfwProvider');
  return ctx;
}
