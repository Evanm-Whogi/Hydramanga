import { apiGet } from '@/lib/api';

export async function getRecentlyRead(limit: number = 20): Promise<any> {
    return await apiGet(`/home/recentlyRead?limit=${limit}`);
}

export async function getPopularManga(period: string = 'week', limit: number = 14): Promise<any> {
    return await apiGet(`/home/popularManga?period=${period}&limit=${limit}`);
}

export async function getHeroManga(period: string = 'week', limit: number = 14, heroCount: number = 6): Promise<any> {
    return await apiGet(`/home/heroManga?period=${period}&limit=${limit}&heroCount=${heroCount}`);
}

export async function getHighScores(type: string = "all", limit: number = 14): Promise<any> {
    return await apiGet(`/home/highScores?type=${type}&limit=${limit}`);
}

export async function getRecentComments(limit: number = 20): Promise<any> {
    return await apiGet(`/home/recentComments?limit=${limit}`);
}

export async function getTopCommenters(limit: number = 20): Promise<any> {
    return await apiGet(`/home/topCommenters?limit=${limit}`);
}

export async function getRecentChaptersFromUserList(limit: number = 20): Promise<any> {
    return await apiGet(`/home/recentChaptersFromList?limit=${limit}`);
}

export async function getRecentlyUpdated(period: string = 'all', limit: number = 14): Promise<any> {
    return await apiGet(`/home/recentlyUpdated?period=${period}&limit=${limit}`);
}

function mapTrendingPeriod(period: string): string {
    if (period === 'today') return 'day';
    if (period === 'all') return 'year';
    if (period === '2weeks') return '2weeks';
    return period;
}

export async function getTrendingManga(period: string = '2weeks', limit: number = 14): Promise<any> {
    const data = await apiGet(`/analytics/trending?period=${mapTrendingPeriod(period)}&limit=${limit}`);
    return data?.manga ?? [];
}