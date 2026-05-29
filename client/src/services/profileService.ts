import { apiGet, apiPost } from '@/lib/api';
import type { UserStats } from '@/types/stats';

export interface PublicProfile {
  id: string;
  name: string;
  username?: string | null;
  image: string | null;
  bio?: string | null;
  role?: string;
  createdAt?: string;
  karmaTotal?: number;
  isPrivate?: boolean;
  isOwner?: boolean;
  isProfilePublic?: boolean;
  stats?: Partial<UserStats>;
}

export async function getPublicProfile(identifier: string): Promise<{ profile: PublicProfile }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/public`);
}

export async function exportMyData() {
  return apiGet('/users/me/export');
}

export async function importMyData(payload: unknown) {
  return apiPost('/users/me/import', payload);
}
