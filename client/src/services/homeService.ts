import { apiGet } from '@/lib/api';

export async function getRecentlyRead(): Promise<any> {
    return await apiGet(`/home/recentlyRead`);
}

export async function getRecentlyAdded(page: number = 1, limit: number = 20, offset: number = 0): Promise<any> {
    return await apiGet(`/home/recentlyAdded?page=${page}&limit=${limit}&offset=${offset}`);
}

export async function getPopularChapters(period: string = 'week', limit: number = 14): Promise<any> {
    return await apiGet(`/home/popularChapters?period=${period}&limit=${limit}`);
}

export async function getPopularManga(period: string = 'week', limit: number = 14): Promise<any> {
    return await apiGet(`/home/popularManga?period=${period}&limit=${limit}`);
}

export async function getHighScores(type: string = "all", limit: number = 14): Promise<any> {
    return await apiGet(`/home/highScores?type=${type}&limit=${limit}`);
}

export async function getMostFollowed(period: string = 'week', limit: number = 14): Promise<any> {
    return await apiGet(`/home/mostFollowed?period=${period}&limit=${limit}`);
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