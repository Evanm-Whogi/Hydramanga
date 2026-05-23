import { apiGet } from '@/lib/api';
import type { UserStats } from '@/types/stats';

export interface PublicProfile {
  id: string;
  name: string;
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

export async function getPublicProfile(userId: string): Promise<{ profile: PublicProfile }> {
  return apiGet(`/users/${userId}/public`);
}
