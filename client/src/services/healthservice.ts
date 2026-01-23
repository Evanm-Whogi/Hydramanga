import { apiGet } from '@/lib/api';
import { Heartbeat } from '@/types/global';

export async function getHeartbeat(): Promise<Heartbeat> {
    const data = await apiGet('/admin/heartbeat');
    if (!data) throw new Error('No data received from server');
    return data as Heartbeat;
}