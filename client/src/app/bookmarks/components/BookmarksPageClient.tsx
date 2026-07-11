'use client';

import { useCallback, useEffect, useState } from 'react';
import { Grid2X2, TextAlignJustify } from 'lucide-react';
import { toast } from 'react-toastify';
import { fetchBookmarks, SeriesBookmark, BOOKMARK_STATUSES, getStatusLabel, removeBookmark, setBookmark, BookmarkStatus } from '@/services/bookmarkService';
import { getProfileBookmarks } from '@/services/profileService';
import { FILTER_OPTIONS } from '@/constants/filters';
import SeriesGridCard from '@/components/SeriesGridCard';
import SeriesBookmarkModal from '@/components/SeriesBookmarkModal';
import { mangaPath } from '@/lib/paths';
import BookmarksTable from '@/app/bookmarks/components/BookmarksTable';
import MultiDropdown from '@/components/Checkbox';
import SingleDropdown from '@/components/Dropdown';
import { toastApiError } from '@/lib/rateLimit';

const SORT_OPTIONS = [
  { label: 'Recently Bookmarked', value: 'bookmarked' },
  { label: 'Last Read', value: 'lastRead' },
  { label: 'Updated', value: 'updated' },
  { label: 'Title', value: 'title' },
  { label: 'Ranking', value: 'ranking' },
];

export default function BookmarksPageClient({ identifier, readOnly = false }: { identifier?: string; readOnly?: boolean }) {
  const [bookmarks, setBookmarks] = useState<SeriesBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sort, setSort] = useState('bookmarked');
  const [saveTarget, setSaveTarget] = useState<{ seriesId: number; title: string } | null>(null);

  const load = useCallback(async (withLoading = true) => {
    if (withLoading) setLoading(true);
    try {
      const params = {
        status: selectedStatuses.length ? selectedStatuses : undefined,
        type: selectedTypes.length ? selectedTypes : undefined,
        sort,
      };
      const res = identifier && identifier !== 'me'
        ? await getProfileBookmarks(identifier, params)
        : await fetchBookmarks(params);
      setBookmarks(res.bookmarks);
    } catch (err) {
      toastApiError(err, 'Failed to load bookmarks');
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [identifier, selectedStatuses, selectedTypes, sort]);

  useEffect(() => { load(true); }, [load]);

  const updateBookmarkStatus = useCallback(async (seriesId: number, status: BookmarkStatus) => {
    let previousStatus: BookmarkStatus | null = null;
    setBookmarks((current) => current.map((bookmark) => {
      if (bookmark.seriesId !== seriesId) return bookmark;
      previousStatus = bookmark.status;
      return { ...bookmark, status, updatedAt: new Date().toISOString() };
    }));
    try {
      await setBookmark(seriesId, status);
    } catch (err) {
      if (previousStatus) {
        setBookmarks((current) => current.map((bookmark) => (
          bookmark.seriesId === seriesId ? { ...bookmark, status: previousStatus as BookmarkStatus } : bookmark
        )));
      }
      toastApiError(err, 'Failed to update status');
      throw err;
    }
  }, []);

  const bulkSetBookmarkStatus = useCallback(async (seriesIds: number[], status: BookmarkStatus) => {
    const previous = bookmarks;
    const idSet = new Set(seriesIds);
    setBookmarks((current) => current.map((bookmark) => (
      idSet.has(bookmark.seriesId) ? { ...bookmark, status, updatedAt: new Date().toISOString() } : bookmark
    )));
    const results = await Promise.allSettled(seriesIds.map((seriesId) => setBookmark(seriesId, status)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      setBookmarks(previous);
      toast.error(`${failed} of ${seriesIds.length} failed`);
      throw new Error('Bulk status update failed');
    }
  }, [bookmarks]);

  const bulkRemoveBookmarks = useCallback(async (seriesIds: number[]) => {
    const previous = bookmarks;
    const idSet = new Set(seriesIds);
    setBookmarks((current) => current.filter((bookmark) => !idSet.has(bookmark.seriesId)));
    const results = await Promise.allSettled(seriesIds.map((seriesId) => removeBookmark(seriesId)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      setBookmarks(previous);
      toast.error(`${failed} of ${seriesIds.length} failed`);
      throw new Error('Bulk remove failed');
    }
  }, [bookmarks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <MultiDropdown
            label="All statuses"
            options={BOOKMARK_STATUSES.map((status) => ({ label: status.label, value: status.value })) as any}
            onChange={setSelectedStatuses}
            initialValue={selectedStatuses}
            size="w-full"
          />
          <MultiDropdown
            label="All formats"
            options={FILTER_OPTIONS.types as any}
            onChange={setSelectedTypes}
            initialValue={selectedTypes}
            size="w-full"
          />
          <SingleDropdown options={SORT_OPTIONS as any} onChange={setSort} initialValue={sort} size="w-full" />
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setViewMode('grid')} className={`rounded-md p-2 transition-colors ${viewMode === 'grid' ? 'bg-accent text-foreground' : 'bg-foreground text-muted hover:bg-foreground/50'}`} aria-label="Grid view">
              <Grid2X2 className="size-5" />
            </button>
            <button onClick={() => setViewMode('list')} className={`rounded-md p-2 transition-colors ${viewMode === 'list' ? 'bg-accent text-foreground' : 'bg-foreground text-muted hover:bg-foreground/50'}`} aria-label="List view">
              <TextAlignJustify className="size-5" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted">Loading bookmarks...</div>
      ) : bookmarks.length === 0 ? (
        <div className="py-20 text-center text-muted">{readOnly ? 'No bookmarks to show.' : 'No bookmarks yet. Browse manga and set a bookmark status.'}</div>
      ) : viewMode === 'grid' || readOnly ? (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {bookmarks.map((bookmark, index) => (
            <div key={bookmark.seriesId} className="flex flex-col gap-1">
              <SeriesGridCard
                seriesId={bookmark.seriesId}
                title={bookmark.title}
                cover={bookmark.cover}
                href={mangaPath(bookmark.seriesId)}
                type={bookmark.type}
                status={bookmark.seriesStatus}
                totalChapters={bookmark.totalChapters}
                popularityGlobalCurrent={bookmark.popularityGlobalCurrent}
                popularityTypeCurrent={bookmark.popularityTypeCurrent}
                popularity={bookmark.popularity}
                onSaveClick={readOnly ? undefined : (seriesId, title) => setSaveTarget({ seriesId, title })}
                priority={index < 16}
              />
              <span className="text-center text-xs font-medium text-muted">{getStatusLabel(bookmark.status)}</span>
            </div>
          ))}
        </div>
      ) : (
        <BookmarksTable
          bookmarks={bookmarks}
          onStatusChange={updateBookmarkStatus}
          onBulkSetStatus={bulkSetBookmarkStatus}
          onBulkRemove={bulkRemoveBookmarks}
        />
      )}
      {saveTarget ? (
        <SeriesBookmarkModal isOpen onClose={() => setSaveTarget(null)} seriesId={saveTarget.seriesId} mangaTitle={saveTarget.title} />
      ) : null}
    </div>
  );
}
