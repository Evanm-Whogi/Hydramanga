import { apiPost, apiGet, apiDelete } from '@/lib/api';
import { cache } from 'react';
import { UserStatsResponse } from '@/types/stats';

export async function getHomepage(): Promise<any> {
    return await apiGet(`/home`);
}

export async function getIndex(): Promise<any> {
    return await apiGet(`/index`);
}

// Cache this to prevent duplicate requests in generateMetadata + page component
// This endpoint returns public data for bots/unauthenticated and full data for authenticated users
export const fetchOne = cache(async (id: any): Promise<any> => {
    return await apiGet(`/manga/${id}`);
});

// Cache homepage data to prevent duplicate requests
export const fetchHomepage = cache(async (): Promise<any> => {
    return await getHomepage();
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

export async function fetchGallery(id: any): Promise<any> {
    return await apiGet(`/manga/${id}/gallery`);
}


export async function fetchMangaPages(id: any, chapterId: any): Promise<any> {
    return await apiGet(`/manga/${id}/${chapterId}`);
}

// Analytics & Metrics
export async function getTrending(period: string = 'week', limit: number = 20): Promise<any> {
    return await apiGet(`/analytics/trending?period=${period}&limit=${limit}`);
}

export async function getMangaAnalytics(id: number): Promise<any> {
    return await apiGet(`/analytics/manga/${id}`);
}

// Reading Progress
export async function getMyProgress(limit: number = 20): Promise<any> {
    return await apiGet(`/analytics/progress?limit=${limit}`);
}

export async function getMangaProgress(id: number): Promise<any> {
    return await apiGet(`/analytics/progress/manga/${id}`);
}

export async function getSeriesChapterProgress(id: number): Promise<any> {
    return await apiGet(`/analytics/progress/manga/${id}/chapters`);
}

export async function updateProgress(data: {
    seriesId: number;
    chapterId: number;
    pageNumber: number;
    totalPagesInChapter: number;
}): Promise<any> {
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

/**
 * Delete a manga from user's view history
 * @param seriesId - The series ID to delete from view history
 * @throws Error if deletion fails
 */
export async function deleteViewHistory(seriesId: number): Promise<any> {
    return await apiDelete(`/analytics/views/${seriesId}`);
}

/**
 * Fetch user reading statistics
 * @returns User statistics including total series, average completion, and reading times
 */
export async function getUserStats(): Promise<UserStatsResponse> {
    return await apiGet('/analytics/stats');
}

export async function getRecommendedManga(id: number, limit: number = 8): Promise<any> {
    return await apiGet(`/manga/${id}/recommendations?limit=${limit}`);
}

/**
 * Record reading time for a chapter
 * @param data - Reading time data containing seriesId, chapterId, and seconds
 */
export async function recordReadingTime(data: {
    seriesId: number;
    chapterId: number;
    seconds: number;
}): Promise<any> {
    return await apiPost('/analytics/progress/time', data);
}
/**
 * Clear all reading progress history for the user
 */
export async function clearAllProgress(): Promise<any> {
    return await apiDelete('/analytics/progress/all');
}

/**
 * Clear all view history for the user
 */
export async function clearAllViewHistory(): Promise<any> {
    return await apiDelete('/analytics/views/all');
}

/**
 * Get user's manga view history
 * @param limit - Maximum number of results to return
 */
export async function getMyViewHistory(limit: number = 50): Promise<any> {
    return await apiGet(`/analytics/views?limit=${limit}`);
}

/**
 * Fetch a random selection of manga for discovery
 * @param limit - Number of random manga to fetch (default is 4)
 */
export async function getRandomManga(limit: number = 4): Promise<any> {
    return await apiGet(`/manga/random?limit=${limit}`);
}