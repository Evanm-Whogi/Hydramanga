import { apiGet, apiPatch, apiPost } from '@/lib/api';

export interface AdminUserXp {
  totalXp: number;
  level: number;
  levelName: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  bio: string | null;
  emailVerified: boolean;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  isBanned: boolean;
  createdAt: string;
  lastOnlineAt: string | null;
  badgeIds: string[];
  xp: AdminUserXp;
}

export interface AdminUsersListResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'all' | 'user' | 'admin';
  status?: 'all' | 'active' | 'banned';
}

export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.role && params.role !== 'all') query.set('role', params.role);
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const qs = query.toString();
  const data = await apiGet(`/admin/users${qs ? `?${qs}` : ''}`);
  return {
    users: (data as { users: AdminUser[] }).users ?? [],
    pagination: (data as { pagination: AdminUsersListResponse['pagination'] }).pagination,
  };
}

export async function getAdminUser(userId: string): Promise<AdminUser> {
  const data = await apiGet(`/admin/users/${userId}`);
  return (data as { user: AdminUser }).user;
}

export interface AdminUserUpdatePayload {
  name?: string;
  email?: string;
  role?: 'user' | 'admin' | 'moderator';
  bio?: string | null;
  emailVerified?: boolean;
  image?: string | null;
  badgeIds?: string[];
}

export async function updateAdminUser(userId: string, updates: AdminUserUpdatePayload): Promise<AdminUser> {
  const data = await apiPatch(`/admin/users/${userId}`, updates);
  return (data as { user: AdminUser }).user;
}

export async function sendAdminUserVerificationEmail(userId: string): Promise<void> {
  await apiPost(`/admin/users/${userId}/send-verification`);
}

export async function sendAdminUserPasswordReset(userId: string): Promise<void> {
  await apiPost(`/admin/users/${userId}/send-password-reset`);
}

export interface BanAdminUserPayload {
  banReason?: string;
  banExpiresIn?: number;
}

export async function banAdminUser(userId: string, payload: BanAdminUserPayload = {}): Promise<AdminUser> {
  const data = await apiPost(`/admin/users/${userId}/ban`, payload);
  return (data as { user: AdminUser }).user;
}

export async function unbanAdminUser(userId: string): Promise<AdminUser> {
  const data = await apiPost(`/admin/users/${userId}/unban`);
  return (data as { user: AdminUser }).user;
}
