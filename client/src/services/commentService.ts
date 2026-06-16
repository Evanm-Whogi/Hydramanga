import { apiGet, apiPost, apiDelete, apiPut } from '@/lib/api';

export type CommentSort = 'recent' | 'oldest' | 'top' | 'worst';

export type CommentPagination = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export async function fetchComments(seriesId: number, options: { chapterId?: number; sort?: CommentSort; page?: number; limit?: number } = {}): Promise<{ comments: any[]; pagination: CommentPagination }> {
  const params = new URLSearchParams({ seriesId: String(seriesId) });
  if (options.chapterId != null) params.set('chapterId', String(options.chapterId));
  if (options.sort) params.set('sort', options.sort);
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  const data = await apiGet(`/comments?${params.toString()}`);
  if (!data) throw new Error('Failed to fetch comments');
  return data;
}

export async function postComment({ seriesId, chapterId, content, parentId, isSpoiler }: { seriesId: number, chapterId?: number | null, content: string, parentId?: number | null, isSpoiler?: boolean }): Promise<any> {
    const data = await apiPost('/comments', { seriesId, chapterId: chapterId ?? null, content, parentId, isSpoiler });
    if (!data) throw new Error('Failed to post comment');
    return data;
}

export async function voteComment(commentId: number, type: 'like' | 'dislike'): Promise<any> {
    const data = await apiPost('/comments/vote', { commentId, type });
    if (!data) throw new Error('Failed to vote on comment');
    return data;
}

export async function updateComment(commentId: number, content: string): Promise<any> {
    const data = await apiPut(`/comments/${commentId}`, { content });
    if (!data) throw new Error('Failed to update comment');
    return data;
}

export async function deleteComment(commentId: number): Promise<any> {
    const data = await apiDelete(`/comments/${commentId}`);
    if (!data) throw new Error('Failed to delete comment');
    return data;
}