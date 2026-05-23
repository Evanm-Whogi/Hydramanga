import { apiGet, apiPatch } from '@/lib/api';

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
  createdAt: string;
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
}

export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.role && params.role !== 'all') query.set('role', params.role);

  const qs = query.toString();
  const data = await apiGet(`/admin/users${qs ? `?${qs}` : ''}`);
  return {
    users: (data as { users: AdminUser[] }).users ?? [],
    pagination: (data as { pagination: AdminUsersListResponse['pagination'] }).pagination,
  };
}

export interface AdminUserUpdatePayload {
  name?: string;
  email?: string;
  role?: 'user' | 'admin';
  bio?: string | null;
  emailVerified?: boolean;
  image?: string | null;
}

export async function updateAdminUser(userId: string, updates: AdminUserUpdatePayload): Promise<AdminUser> {
  const data = await apiPatch(`/admin/users/${userId}`, updates);
  return (data as { user: AdminUser }).user;
}
