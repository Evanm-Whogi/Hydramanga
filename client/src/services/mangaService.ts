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

export async function fetchMangaPages(id: any, chapterId: any): Promise<any> {
    return await apiGet(`/manga/${id}/${chapterId}`);
}
