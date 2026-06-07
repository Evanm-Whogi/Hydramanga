import { apiGet, apiPut, apiDelete } from '@/lib/api';

export const BOOKMARK_STATUSES = [
  { label: 'Reading', value: 'reading' },
  { label: 'Rereading', value: 'rereading' },
  { label: 'Planned', value: 'planned' },
  { label: 'Completed', value: 'completed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Dropped', value: 'dropped' },
] as const;

export type BookmarkStatus = typeof BOOKMARK_STATUSES[number]['value'];

export interface SeriesBookmark {
  seriesId: number;
  status: BookmarkStatus;
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt: string | null;
  lastReadAt: string | null;
  title: string;
  cover: any;
  type: string | null;
  genres: string[] | null;
  weightedScore: number | null;
  rating: number | null;
  totalChapters: number | null;
  description: string | null;
  views: number | null;
  year: number | null;
  seriesStatus: string | null;
  lastChapterId: number | null;
  lastPageNumber: number | null;
  chapterNumber: string | null;
  chapterTitle: string | null;
  percentageCompleted: number | null;
}

export const fetchBookmarks = async (params?: {status?: string[]; type?: string[]; sort?: string;search?: string}): Promise<{ success: boolean; bookmarks: SeriesBookmark[]; total: number }> => {
  const qs = new URLSearchParams();
  params?.status?.forEach((s) => qs.append('status', s));
  params?.type?.forEach((t) => qs.append('type', t));
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString();
  const path = `/bookmarks${query ? `?${query}` : ''}`;
  const data = await apiGet(path);
  if (!data) throw new Error('Failed to fetch bookmarks');
  return data;
};

export const setBookmark = async (seriesId: number, status: BookmarkStatus) => {
  const data = await apiPut(`/bookmarks/${seriesId}`, { status });
  if (!data) throw new Error('Failed to set bookmark');
  return data;
};

export const removeBookmark = async (seriesId: number) => {
  const data = await apiDelete(`/bookmarks/${seriesId}`);
  if (!data) throw new Error('Failed to remove bookmark');
  return data;
};

export const getStatusLabel = (status: BookmarkStatus | string | null): string => {
  if (!status) return 'Bookmark';
  return BOOKMARK_STATUSES.find((s) => s.value === status)?.label ?? status;
};
