import { apiPost, apiDelete, apiPut } from '@/lib/api';

export async function postComment({ seriesId, content, parentId, isSpoiler }: { seriesId: number, content: string, parentId?: number | null, isSpoiler?: boolean }): Promise<any> {
    const data = await apiPost('/comments', { seriesId, content, parentId, isSpoiler });
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