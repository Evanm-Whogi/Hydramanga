import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import type { UserStats } from '@/types/stats';
import type { EarnedBadge } from '@/lib/badgeConfig';
import type { ProfileVisibility } from '@/types/profile';

export const PROFILE_PAGE_SIZE = 20;

export interface ProfilePagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface PublicProfile {
  id: string;
  name: string;
  username?: string | null;
  image: string | null;
  bio?: string | null;
  role?: string;
  createdAt?: string;
  lastOnlineAt?: string;
  karmaTotal?: number;
  badges?: EarnedBadge[];
  isPrivate?: boolean;
  isOwner?: boolean;
  isProfilePublic?: boolean;
  profileVisibility?: ProfileVisibility;
  stats?: Partial<UserStats>;
}

export interface ProfileWallVote {
  userId: string;
  type: string;
}

export interface ProfileWallPost {
  id: number;
  content: string;
  parentId?: number | null;
  authorUserId?: string;
  createdAt: string;
  updatedAt?: string;
  author?: { id: string; name: string; image: string | null; username?: string | null; displayUsername?: string | null; role?: string };
  votes?: ProfileWallVote[];
  replies?: ProfileWallPost[];
}

export type ProfileWallSort = 'recent' | 'oldest' | 'top' | 'worst';

export interface ProfileCommentItem {
  id: number;
  content: string;
  seriesId: number;
  createdAt: string;
  series: { id: number; title: string | null; cover: string };
}

export interface ProfileRecentReadItem {
  seriesId: number;
  title: string | null;
  cover: string;
  type: string | null;
  percentageCompleted: number | null;
  updatedAt: string;
}

export interface ProfileListItem {
  id: number;
  title: string;
  slug: string;
  description: string;
  visibility: string;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function getPublicProfile(identifier: string): Promise<{ profile: PublicProfile }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/public`);
}

export async function getProfileStats(identifier: string): Promise<{ stats: UserStats }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/stats`);
}

export async function getProfileFavorites(identifier: string): Promise<{ favorites: any[] }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/favorites`);
}

export async function setMyFavorites(seriesIds: number[]): Promise<{ favorites: any[] }> {
  return apiPut('/users/me/favorites', { seriesIds });
}

export async function getProfileWall(identifier: string, page = 1, limit = PROFILE_PAGE_SIZE, sort: ProfileWallSort = 'recent'): Promise<{ posts: ProfileWallPost[]; pagination: ProfilePagination }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/wall?page=${page}&limit=${limit}&sort=${sort}`);
}

export async function createProfileWallPost(identifier: string, content: string, parentId?: number): Promise<{ post: ProfileWallPost }> {
  return apiPost(`/users/${encodeURIComponent(identifier)}/wall`, { content, parentId });
}

export async function updateProfileWallPost(identifier: string, postId: number, content: string): Promise<{ post: ProfileWallPost }> {
  return apiPut(`/users/${encodeURIComponent(identifier)}/wall/${postId}`, { content });
}

export async function voteProfileWallPost(identifier: string, postId: number, type: 'like' | 'dislike'): Promise<void> {
  return apiPost(`/users/${encodeURIComponent(identifier)}/wall/vote`, { postId, type });
}

export async function deleteProfileWallPost(identifier: string, postId: number): Promise<void> {
  return apiDelete(`/users/${encodeURIComponent(identifier)}/wall/${postId}`);
}

export async function getProfileComments(identifier: string, page = 1, limit = PROFILE_PAGE_SIZE): Promise<{ comments: ProfileCommentItem[]; pagination: ProfilePagination }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/comments?page=${page}&limit=${limit}`);
}

export async function getProfileRecentReads(identifier: string, page = 1, limit = PROFILE_PAGE_SIZE): Promise<{ items: ProfileRecentReadItem[]; pagination: ProfilePagination }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/recent-reads?page=${page}&limit=${limit}`);
}

export async function getProfileBookmarks(identifier: string, params?: { status?: string[]; type?: string[]; sort?: string }): Promise<{ success: boolean; bookmarks: any[]; total: number }> {
  const qs = new URLSearchParams();
  params?.status?.forEach((s) => qs.append('status', s));
  params?.type?.forEach((t) => qs.append('type', t));
  if (params?.sort) qs.set('sort', params.sort);
  qs.set('limit', '500');
  const query = qs.toString();
  return apiGet(`/users/${encodeURIComponent(identifier)}/bookmarks${query ? `?${query}` : ''}`);
}

export async function getProfileLists(identifier: string): Promise<{ lists: ProfileListItem[] }> {
  return apiGet(`/users/${encodeURIComponent(identifier)}/lists`);
}

export async function exportMyData() {
  return apiGet('/users/me/export');
}

export async function importMyData(payload: unknown) {
  return apiPost('/users/me/import', payload);
}
