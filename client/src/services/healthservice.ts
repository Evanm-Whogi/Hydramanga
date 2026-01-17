import Api from '@/lib/api';
import { Heartbeat } from '@/types/global';

export async function getHeartbeat(): Promise<Heartbeat> {
    const response = await Api.get('/heartbeat');
    if (!response.data) throw new Error('No data received from server');
    return response.data;
}