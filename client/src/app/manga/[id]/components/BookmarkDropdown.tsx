"use client";

import { useState, useRef, useCallback } from 'react';
import { BookmarkIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { BOOKMARK_STATUSES, setBookmark, removeBookmark, getStatusLabel, BookmarkStatus } from '@/services/bookmarkService';
import { toast } from 'react-toastify';
import { toastApiError } from '@/lib/rateLimit';
import { useUser } from '@/providers/UserProvider';
import { requireAuth } from '@/lib/requireAuth';

export default function BookmarkDropdown({ seriesId, initialStatus, mangaTitle }: { seriesId: number; initialStatus: BookmarkStatus | string | null; mangaTitle?: string }) {
  const { user } = useUser();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<BookmarkStatus | null>((initialStatus as BookmarkStatus) || null);
  const [loading, setLoading] = useState(false);

  const closeDropdown = useCallback(() => setOpen(false), []);
  useClickOutside(rootRef, closeDropdown, open);

  const handleSetStatus = async (newStatus: BookmarkStatus) => {
    setLoading(true);
    setOpen(false);
    try {
      await setBookmark(seriesId, newStatus);
      setStatus(newStatus);
      toast.success(`Bookmarked as ${getStatusLabel(newStatus)}`);
    } catch (error) {
      toastApiError(error, 'Failed to update bookmark');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    setOpen(false);
    try {
      await removeBookmark(seriesId);
      setStatus(null);
      toast.info('Bookmark removed');
    } catch (error) {
      toastApiError(error, 'Failed to remove bookmark');
    } finally {
      setLoading(false);
    }
  };

  const label = status ? getStatusLabel(status) : 'Bookmark';

  return (
    <div className="relative inline-flex items-center gap-3">
      <div ref={rootRef} className="relative">
        <button onClick={() => { if (!requireAuth(user, `/manga/${seriesId}`)) return; setOpen(!open); }} disabled={loading} className={`inline-flex items-center bg-foreground hover:bg-foreground/50 p-2 rounded-md cursor-pointer border-none text-primary transition-all ${loading ? 'animate-manga-pulse' : ''}`}>
          <BookmarkIcon className={`size-6 mr-2 transition-colors ${status ? 'fill-accent text-accent' : ''}`} />
          <span className="capitalize">{label}</span>
          <ChevronDownIcon className={`ml-2 size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 bg-foreground rounded-md shadow-xl z-50 flex flex-col min-w-40 overflow-hidden border border-white/10">
            {BOOKMARK_STATUSES.map((s) => (
              <button key={s.value} onClick={() => handleSetStatus(s.value)} className={`px-4 py-2 hover:bg-white/10 text-left border-none bg-transparent text-inherit cursor-pointer ${status === s.value ? 'text-accent font-medium' : ''}`}>
                {s.label}
              </button>
            ))}
            {status && (
              <>
                <div className="h-px bg-white/10 w-full" />
                <button onClick={handleRemove} className="px-4 py-2 hover:bg-red-500/10 text-left border-none bg-transparent text-red-400 cursor-pointer flex items-center font-medium">
                  <Trash2Icon className="size-4 mr-2" /> Remove
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
