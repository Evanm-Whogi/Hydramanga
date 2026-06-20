import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

export type ListVisibility = 'public' | 'private';
export type ListSort = 'popular' | 'views' | 'newest' | 'title' | 'itemCount';
export type ListCommentSort = 'recent' | 'oldest' | 'top' | 'worst';

export interface ListAuthor {
  id: string;
  name: string;
  image: string | null;
  role: string;
  username: string | null;
  displayUsername: string | null;
}

export interface CuratedList {
  id: number;
  userId: string;
  title: string;
  slug: string;
  description: string;
  visibility: ListVisibility;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  saveCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  author?: ListAuthor;
  previewCovers?: string[];
  userVote?: string | null;
  userSaved?: boolean;
  hasSeries?: boolean;
}

export interface CuratedListItem {
  id: number;
  title: string | null;
  cover: unknown;
  type: string | null;
  status: string | null;
  rating: number | null;
  views: number;
  totalChapters: string | null;
  year: number | null;
  isNew?: boolean;
  hasImportedChapters?: boolean;
  sortOrder?: number;
}

export interface ListGenreTag {
  name: string;
  count: number;
}

export interface CuratedListDetail extends CuratedList {
  items: CuratedListItem[];
  genreTags: ListGenreTag[];
  isOwner: boolean;
}

export interface ListCommentNode {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  parentId: number | null;
  author?: ListAuthor;
  votes?: { userId: string; type: string }[];
  replies?: ListCommentNode[];
}

export interface ListCommentPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const LIST_SORT_OPTIONS = [
  { label: 'Popular', value: 'popular' },
  { label: 'Most Views', value: 'views' },
  { label: 'Newest', value: 'newest' },
  { label: 'Title', value: 'title' },
  { label: 'Most Items', value: 'itemCount' },
] as const;

function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const fetchLists = async (params?: { search?: string; genres?: string[]; sort?: ListSort; limit?: number; offset?: number }) => {
  const data = await apiGet(`/lists${buildQuery(params ?? {})}`);
  if (!data) throw new Error('Failed to fetch lists');
  return data as { success: boolean; lists: CuratedList[]; total: number; limit: number; offset: number };
};

export const fetchMyLists = async (params?: { sort?: ListSort; limit?: number; offset?: number; seriesId?: number }) => {
  const data = await apiGet(`/lists/mine${buildQuery(params ?? {})}`);
  if (!data) throw new Error('Failed to fetch your lists');
  return data as { success: boolean; lists: CuratedList[]; total: number };
};

export const fetchListsForSeries = async (seriesId: number | string, params?: { limit?: number }) => {
  const data = await apiGet(`/lists/for-series/${seriesId}${buildQuery(params ?? {})}`);
  if (!data) throw new Error('Failed to fetch featured lists');
  return data as { success: boolean; lists: CuratedList[]; total: number };
};

export const fetchSavedLists = async (params?: { sort?: ListSort; limit?: number; offset?: number }) => {
  const data = await apiGet(`/lists/saved${buildQuery(params ?? {})}`);
  if (!data) throw new Error('Failed to fetch saved lists');
  return data as { success: boolean; lists: CuratedList[]; total: number };
};

export const fetchListDetail = async (id: number | string) => {
  const data = await apiGet(`/lists/${id}`);
  if (!data?.list) throw new Error('List not found');
  return data as { success: boolean; list: CuratedListDetail };
};

export const createList = async (body: { title: string; description?: string; visibility?: ListVisibility }) => {
  const data = await apiPost('/lists', body);
  if (!data?.list) throw new Error('Failed to create list');
  return data as { success: boolean; list: CuratedList };
};

export const updateList = async (id: number, body: { title?: string; description?: string; visibility?: ListVisibility }) => {
  const data = await apiPut(`/lists/${id}`, body);
  if (!data?.list) throw new Error('Failed to update list');
  return data as { success: boolean; list: CuratedList };
};

export const deleteList = async (id: number) => {
  const data = await apiDelete(`/lists/${id}`);
  if (!data) throw new Error('Failed to delete list');
  return data;
};

export const addListItem = async (listId: number, seriesId: number) => {
  const data = await apiPost(`/lists/${listId}/items`, { seriesId });
  if (!data) throw new Error('Failed to add manga');
  return data;
};

export const removeListItem = async (listId: number, seriesId: number) => {
  const data = await apiDelete(`/lists/${listId}/items/${seriesId}`);
  if (!data) throw new Error('Failed to remove manga');
  return data;
};

export const voteList = async (listId: number, type: 'like' | 'dislike') => {
  const data = await apiPost(`/lists/${listId}/vote`, { type });
  if (!data) throw new Error('Failed to vote');
  return data as { success: boolean; userVote: string | null };
};

export const saveList = async (listId: number) => {
  const data = await apiPost(`/lists/${listId}/save`);
  if (!data) throw new Error('Failed to save list');
  return data as { success: boolean; userSaved: boolean };
};

export const unsaveList = async (listId: number) => {
  const data = await apiDelete(`/lists/${listId}/save`);
  if (!data) throw new Error('Failed to unsave list');
  return data as { success: boolean; userSaved: boolean };
};

export const trackListView = async (listId: number) => {
  return apiPost(`/lists/${listId}/track-view`);
};

export const fetchListComments = async (listId: number, params?: { sort?: ListCommentSort; page?: number; limit?: number }) => {
  const data = await apiGet(`/lists/${listId}/comments${buildQuery(params ?? {})}`);
  if (!data) throw new Error('Failed to fetch comments');
  return data as { comments: ListCommentNode[]; pagination: ListCommentPagination };
};

export const postListComment = async (listId: number, body: { content: string; parentId?: number }) => {
  const data = await apiPost(`/lists/${listId}/comments`, body);
  if (!data?.comment) throw new Error('Failed to post comment');
  return data;
};

export const deleteListComment = async (listId: number, commentId: number) => {
  const data = await apiDelete(`/lists/${listId}/comments/${commentId}`);
  if (!data) throw new Error('Failed to delete comment');
  return data;
};

export const voteListComment = async (listId: number, commentId: number, type: 'like' | 'dislike') => {
  const data = await apiPost(`/lists/${listId}/comments/vote`, { commentId, type });
  if (!data) throw new Error('Failed to vote on comment');
  return data;
};

export const searchMangaForList = async (q: string) => {
  const data = await apiGet(`/lists/search-manga?q=${encodeURIComponent(q)}`);
  if (!data) throw new Error('Search failed');
  return data as { success: boolean; results: { id: number; title: string | null; cover: string | null }[] };
};

export const reportList = async (listId: number, body: { listTitle: string; reportType: string; details?: string }) => {
  const data = await apiPost(`/lists/${listId}/report`, body);
  if (!data) throw new Error('Failed to submit report');
  return data;
};
