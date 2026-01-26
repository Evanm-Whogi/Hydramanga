import { apiPost, apiGet } from '@/lib/api';
import { cache } from 'react';

export async function getHomepage(): Promise<any> {
    return await apiGet(`/home`);
}

export async function getIndex(): Promise<any> {
    return await apiGet(`/index`);
}

// Cache this to prevent duplicate requests in generateMetadata + page component
export const fetchOne = cache(async (id: any): Promise<any> => {
    return await apiGet(`/manga/${id}`);
});

// Trigger on-demand chapter scan for a manga (client-side only)
export async function triggerMangaScan(mangaId: number): Promise<any> {
    try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/manga/${mangaId}/scan`, {
            method: 'POST',
            credentials: 'include',
        });
        
        if (!response.ok) {
            console.error(`Failed to trigger manga scan: ${response.status}`);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error triggering manga scan:', error);
        return null;
    }
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
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analytics/progress/manga/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to delete progress');
    return await response.json();
}

export async function getUserStats(): Promise<any> {
    return await apiGet('/analytics/stats');
}

export async function getRecommendedManga(id: number, limit: number = 8): Promise<any> {
    return await apiGet(`/manga/${id}/recommendations?limit=${limit}`);
}
export async function recordReadingTime(data: {seriesId: number; chapterId: number; seconds: number}): Promise<any> {
    return await apiPost('/analytics/progress/time', data);
}