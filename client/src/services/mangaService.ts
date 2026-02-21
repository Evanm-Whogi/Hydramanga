import { apiPost, apiGet, apiDelete } from '@/lib/api';
import { cache } from 'react';
import { UserStatsResponse } from '@/types/stats';

export async function getIndex(): Promise<any> {
    return await apiGet(`/index`);
}

// Cache this to prevent duplicate requests in generateMetadata + page component
// This endpoint returns public data for bots/unauthenticated and full data for authenticated users
export const fetchOne = cache(async (id: any): Promise<any> => {
    return await apiGet(`/manga/${id}`);
});

// Trigger on-demand chapter scan for a manga
export async function triggerMangaScan(mangaId: number): Promise<any> {
    try {
        return await apiPost(`/manga/${mangaId}/scan`);
    } catch (error) {
        return null;
    }
}

export async function getCollections(): Promise<any> {
    return await apiGet(`/manga/collections`);
}

export async function getAllTags(): Promise<{ tags: string[] }> {
    return await apiGet(`/manga/tags`);
}

export async function fetchGallery(id: any): Promise<any> {
    return await apiGet(`/manga/${id}/gallery`);
}

export async function fetchMangaPages(id: any, chapterId: any): Promise<any> {
    return await apiGet(`/manga/${id}/${chapterId}`);
}

export async function getTrending(period: string = 'week', limit: number = 20): Promise<any> {
    return await apiGet(`/analytics/trending?period=${period}&limit=${limit}`);
}

export async function getMangaAnalytics(id: number): Promise<any> {
    return await apiGet(`/analytics/manga/${id}`);
}

export async function getMyProgress(limit: number = 20): Promise<any> {
    return await apiGet(`/analytics/progress?limit=${limit}`);
}

export async function getMangaProgress(id: number): Promise<any> {
    return await apiGet(`/analytics/progress/manga/${id}`);
}

export async function getSeriesChapterProgress(id: number): Promise<any> {
    return await apiGet(`/analytics/progress/manga/${id}/chapters`);
}

export async function updateProgress(data: {seriesId: number; chapterId: number; pageNumber: number; totalPagesInChapter: number}): Promise<any> {
    return await apiPost('/analytics/progress', data);
}

export async function markChapterAsRead(seriesId: number, chapterId: number): Promise<any> {
    return await apiPost('/analytics/progress/mark-read', { seriesId, chapterId });
}

export async function markChapterAsUnread(chapterId: number): Promise<any> {
    return await apiPost('/analytics/progress/mark-unread', { chapterId });
}

export async function deleteProgress(id: number): Promise<any> {
    return await apiDelete(`/analytics/progress/manga/${id}`);
}

export async function deleteViewHistory(seriesId: number): Promise<any> {
    return await apiDelete(`/analytics/views/${seriesId}`);
}

export async function getUserStats(): Promise<UserStatsResponse> {
    return await apiGet('/analytics/stats');
}

export async function getRecommendedManga(id: number, limit: number = 8): Promise<any> {
    return await apiGet(`/manga/${id}/recommendations?limit=${limit}`);
}

export async function recordReadingTime(data: {seriesId: number; chapterId: number; seconds: number}): Promise<any> {
    return await apiPost('/analytics/progress/time', data);
}

export async function clearAllProgress(): Promise<any> {
    return await apiDelete('/analytics/progress/all');
}

export async function clearAllViewHistory(): Promise<any> {
    return await apiDelete('/analytics/views/all');
}

export async function getMyViewHistory(limit: number = 50): Promise<any> {
    return await apiGet(`/analytics/views?limit=${limit}`);
}

export async function getRandomManga(limit: number = 4): Promise<any> {
    return await apiGet(`/manga/random?limit=${limit}`);
}