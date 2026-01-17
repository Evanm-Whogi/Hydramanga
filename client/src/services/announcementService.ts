import { apiPost, apiGet } from '@/lib/api';

export async function getAnnouncements(): Promise<any> {
    return await apiGet(`/announcements`);
}

export async function createAnnouncement(data: any): Promise<any> {
    const response = await apiPost('/announcements', data);
    if (!response) throw new Error('Failed to create announcement');
    return response;
}
