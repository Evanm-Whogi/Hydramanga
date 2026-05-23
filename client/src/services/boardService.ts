import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from '@/lib/api';

export async function getBoardPosts(page = 1) {
  return apiGet(`/board/posts?page=${page}`);
}

export async function getBoardPost(postId: number) {
  return apiGet(`/board/posts/${postId}`);
}

export async function createBoardPost(title: string, content: string) {
  return apiPost('/board/posts', { title, content });
}

export async function createBoardReply(postId: number, content: string, parentId?: number) {
  return apiPost(`/board/posts/${postId}/replies`, { content, parentId });
}

export async function voteBoardPost(postId: number, type: 'like' | 'dislike') {
  return apiPost('/board/vote', { postId, type });
}

export async function voteBoardReply(replyId: number, type: 'like' | 'dislike') {
  return apiPost('/board/vote/reply', { replyId, type });
}

export async function updateBoardPost(postId: number, data: { title?: string; content?: string }) {
  return apiPatch(`/board/posts/${postId}`, data);
}

export async function deleteBoardPost(postId: number) {
  return apiDelete(`/board/posts/${postId}`);
}

export async function updateBoardReply(replyId: number, content: string) {
  return apiPatch(`/board/replies/${replyId}`, { content });
}

export async function deleteBoardReply(replyId: number) {
  return apiDelete(`/board/replies/${replyId}`);
}

export async function adminBoardPost(postId: number, updates: { isPinned?: boolean; isLocked?: boolean; isDeleted?: boolean }) {
  return apiPatch(`/board/posts/${postId}/admin`, updates);
}
