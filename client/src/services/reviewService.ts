import { apiPost, apiGet, apiPut, apiDelete } from '@/lib/api';

export async function fetchReviews(seriesId: number): Promise<any> {
    return await apiGet(`/reviews?seriesId=${seriesId}`);
}

export async function postReview({ seriesId, content, rating }: { seriesId: number, content: string, rating: number }): Promise<any> {
    const data = await apiPost('/reviews', { seriesId, content, rating });
    if (!data) throw new Error('Failed to post review');
    return data;
}

export async function updateReview(reviewId: number, { content, rating }: { content: string, rating: number }): Promise<any> {
    const data = await apiPut(`/reviews/${reviewId}`, { content, rating });
    if (!data) throw new Error('Failed to update review');
    return data;
}

export async function deleteReview(reviewId: number): Promise<any> {
    const data = await apiDelete(`/reviews/${reviewId}`);
    if (!data) throw new Error('Failed to delete review');
    return data;
}

export async function voteReview(reviewId: number, type: 'like' | 'dislike'): Promise<any> {
    const data = await apiPost(`/reviews/${reviewId}/vote`, { type });
    if (!data) throw new Error('Failed to vote on review');
    return data;
}
