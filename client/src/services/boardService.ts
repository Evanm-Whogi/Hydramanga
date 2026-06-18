import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import type { ForumSort } from '@/constants/forumCategories';

export type BoardPostsQuery = {
  page?: number;
  q?: string;
  category?: string;
  sort?: ForumSort;
};

export async function getBoardPosts(query: BoardPostsQuery = {}) {
  const params = new URLSearchParams();
  if (query.page && query.page > 1) params.set('page', String(query.page));
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.category && query.category !== 'all') params.set('category', query.category);
  if (query.sort && query.sort !== 'latest') params.set('sort', query.sort);
  const qs = params.toString();
  return apiGet(`/forum/posts${qs ? `?${qs}` : ''}`);
}

export async function getBoardPost(postId: number) {
  return apiGet(`/forum/posts/${postId}`);
}

export async function createBoardPost(data: { title: string; content: string; category: string }) {
  return apiPost('/forum/posts', data);
}

export async function createBoardReply(postId: number, content: string, parentId?: number) {
  return apiPost(`/forum/posts/${postId}/replies`, { content, parentId });
}

export async function voteBoardPost(postId: number, type: 'like' | 'dislike') {
  return apiPost('/forum/vote', { postId, type });
}

export async function voteBoardReply(replyId: number, type: 'like' | 'dislike') {
  return apiPost('/forum/vote/reply', { replyId, type });
}

export async function updateBoardPost(postId: number, data: { title?: string; content?: string; category?: string }) {
  return apiPatch(`/forum/posts/${postId}`, data);
}

export async function deleteBoardPost(postId: number) {
  return apiDelete(`/forum/posts/${postId}`);
}

export async function updateBoardReply(replyId: number, content: string) {
  return apiPatch(`/forum/replies/${replyId}`, { content });
}

export async function deleteBoardReply(replyId: number) {
  return apiDelete(`/forum/replies/${replyId}`);
}

export async function adminBoardPost(postId: number, updates: { isPinned?: boolean; isLocked?: boolean; isDeleted?: boolean }) {
  return apiPatch(`/forum/posts/${postId}/admin`, updates);
}
