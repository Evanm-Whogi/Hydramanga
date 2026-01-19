import { apiPost, apiGet } from '@/lib/api';

export async function getHomepage(): Promise<any> {
    return await apiGet(`/home`);
}

export async function getIndex(): Promise<any> {
    return await apiGet(`/index`);
}


export async function fetchOne(id: any): Promise<any> {
    return await apiGet(`/manga/${id}`);
}

export async function updateMangaList(seriesId: number, status: string): Promise<any> {
    const data = await apiPost('/manga/list', { seriesId, status });
    if (!data) throw new Error('Failed to update manga list');
    return data;
}

export async function removeFromList(seriesId: number): Promise<any> {
    const data = await apiPost('/manga/list/remove', { seriesId });
    if (!data) throw new Error('Failed to remove manga from list');
    return data;
}

export async function fetchUserLists(status: any): Promise<any> {
    return await apiGet(`/manga/list?status=${status}`);
}

export async function fetchAllLists(): Promise<any> {
    return await apiGet(`/manga/lists`);
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
    return await apiGet(`/progress?limit=${limit}`);
}

export async function getMangaProgress(id: number): Promise<any> {
    return await apiGet(`/progress/manga/${id}`);
}

export async function updateProgress(data: {
    seriesId: number;
    chapterId: number;
    pageNumber: number;
    totalPagesInChapter: number;
}): Promise<any> {
    return await apiPost('/progress', data);
}

export async function deleteProgress(id: number): Promise<any> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/progress/manga/${id}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to delete progress');
    return await response.json();
}

export async function getUserStats(): Promise<any> {
    return await apiGet('/progress/stats');
}
