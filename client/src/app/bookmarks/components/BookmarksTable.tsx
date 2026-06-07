'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { getCardCoverUrl } from '@/lib/coverUtils';
import { formatTimeAgo } from '@/lib/utils';
import { mangaPath } from '@/lib/paths';
import { BOOKMARK_STATUSES, type BookmarkStatus, type SeriesBookmark } from '@/services/bookmarkService';
import ThemeCheckbox from '@/components/ThemeCheckbox';

function continueHref(bookmark: SeriesBookmark) {
  if (bookmark.lastChapterId) {
    return `/manga/${bookmark.seriesId}/read/${bookmark.lastChapterId}?page=${bookmark.lastPageNumber || 0}`;
  }
  return mangaPath(bookmark.seriesId);
}

function continueLabel(bookmark: SeriesBookmark) {
  if (bookmark.lastChapterId) return 'Continue';
  return 'Start Reading';
}

interface BookmarksTableProps {
  bookmarks: SeriesBookmark[];
  onStatusChange: (seriesId: number, status: BookmarkStatus) => Promise<void>;
  onBulkSetStatus: (seriesIds: number[], status: BookmarkStatus) => Promise<void>;
  onBulkRemove: (seriesIds: number[]) => Promise<void>;
}

export default function BookmarksTable({ bookmarks, onStatusChange, onBulkSetStatus, onBulkRemove }: BookmarksTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOperating, setBulkOperating] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<BookmarkStatus>('reading');
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(bookmarks.map((bookmark) => bookmark.seriesId));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [bookmarks]);

  const allSelected = bookmarks.length > 0 && selectedIds.size === bookmarks.length;
  const hasSelection = selectedIds.size > 0;

  const toggleOne = (seriesId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(bookmarks.map((bookmark) => bookmark.seriesId)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleStatusChange = async (seriesId: number, status: BookmarkStatus) => {
    setUpdatingIds((prev) => new Set(prev).add(seriesId));
    try {
      await onStatusChange(seriesId, status);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(seriesId);
        return next;
      });
    }
  };

  const runBulkAction = useCallback(async (action: () => Promise<void>, successMessage: string) => {
    if (selectedIds.size === 0 || bulkOperating) return;
    setBulkOperating(true);
    try {
      await action();
      toast.success(successMessage);
      clearSelection();
    } catch {
      // Parent handles error toast/revert
    } finally {
      setBulkOperating(false);
    }
  }, [selectedIds.size, bulkOperating]);

  const handleBulkSetStatus = () => {
    const ids = Array.from(selectedIds);
    runBulkAction(() => onBulkSetStatus(ids, bulkStatus), `Updated ${ids.length} bookmark(s)`);
  };

  const handleBulkRemove = () => {
    const ids = Array.from(selectedIds);
    if (!confirm(`Remove ${ids.length} bookmark(s)?`)) return;
    runBulkAction(() => onBulkRemove(ids), `Removed ${ids.length} bookmark(s)`);
  };

  return (
    <>
      <div className={`overflow-hidden rounded-lg bg-foreground ${hasSelection ? 'pb-4' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-foreground text-muted border-b border-borders">
            <tr>
              <th className="w-10 px-4 py-3">
                <ThemeCheckbox
                  checked={allSelected}
                  indeterminate={hasSelection && !allSelected}
                  onCheckedChange={toggleAll}
                  disabled={bulkOperating}
                  ariaLabel="Select all bookmarks"
                />
              </th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Last read</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Updated</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Status</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Continue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borders">
            {bookmarks.map((bookmark) => {
              const isSelected = selectedIds.has(bookmark.seriesId);
              const isUpdating = updatingIds.has(bookmark.seriesId);
              return (
                <tr key={bookmark.seriesId} className={isSelected ? 'bg-background/60' : 'hover:bg-background/40'}>
                  <td className="px-4 py-3">
                    <ThemeCheckbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(bookmark.seriesId)}
                      disabled={bulkOperating || isUpdating}
                      ariaLabel={`Select ${bookmark.title}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={mangaPath(bookmark.seriesId)} className="group flex min-w-0 items-center gap-3">
                      <img src={getCardCoverUrl(bookmark.cover)} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium text-primary group-hover:text-accent">{bookmark.title}</p>
                        {bookmark.chapterNumber ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                            <BookOpen className="size-3 shrink-0" />
                            Ch. {bookmark.chapterNumber}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {bookmark.lastReadAt ? formatTimeAgo(bookmark.lastReadAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {bookmark.lastUpdatedAt ? formatTimeAgo(bookmark.lastUpdatedAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <select
                      value={bookmark.status}
                      onChange={(e) => handleStatusChange(bookmark.seriesId, e.target.value as BookmarkStatus)}
                      disabled={isUpdating || bulkOperating}
                      className="rounded-md border border-borders bg-background px-2 py-1.5 text-sm text-primary disabled:opacity-50"
                      aria-label={`Status for ${bookmark.title}`}
                    >
                      {BOOKMARK_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={continueHref(bookmark)}
                      className="inline-flex w-36 items-center justify-center rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
                    >
                      {continueLabel(bookmark)} <ChevronRight className="ml-1 size-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {hasSelection ? (
        <>
          <div className="h-20" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-borders bg-background/95 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="container mx-auto flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="text-sm text-muted">{selectedIds.size} selected</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as BookmarkStatus)}
                disabled={bulkOperating}
                className="rounded-md border border-borders bg-foreground px-2 py-1.5 text-sm text-primary disabled:opacity-50"
              >
                {BOOKMARK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkSetStatus}
                disabled={bulkOperating}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {bulkOperating ? <Loader2 className="size-4 animate-spin" /> : 'Set status'}
              </button>
              <button
                type="button"
                onClick={handleBulkRemove}
                disabled={bulkOperating}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-400 px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
              <button type="button" onClick={clearSelection} disabled={bulkOperating} className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-primary disabled:opacity-50">
                Clear
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
