
import { apiPost, apiGet, apiDelete } from '@/lib/api';

export async function fetchComments(seriesId: number): Promise<any> {
    return await apiGet(`/comments?seriesId=${seriesId}`);
}

export async function postComment({ seriesId, content, stars, parentId, isSpoiler }: { seriesId: number, content: string, stars: number, parentId?: number | null, isSpoiler?: boolean }): Promise<any> {
    const data = await apiPost('/comments', { seriesId, content, stars, parentId, isSpoiler });
    if (!data) throw new Error('Failed to post comment');
    return data;
}

export async function likeComment(commentId: number): Promise<any> {
    const data = await apiPost('/comments/like', { commentId });
    if (!data) throw new Error('Failed to like comment');
    return data;
}

export async function deleteComment(commentId: number): Promise<any> {
    const data = await apiDelete(`/comments/${commentId}`);
    if (!data) throw new Error('Failed to delete comment');
    return data;
}