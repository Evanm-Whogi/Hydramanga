import { apiGet, apiPatch } from '@/lib/api';
import type { ImportRequestStatus } from '@/services/importRequestService';

export interface AdminImportRequest {
  id: number;
  userId: string;
  seriesId: number | null;
  requestedTitle: string;
  requestedUrl: string | null;
  notes: string | null;
  adminNotes: string | null;
  status: ImportRequestStatus;
  createdAt: string;
  updatedAt: string;
  userName: string;
  userEmail: string;
  seriesTitle: string | null;
}

export interface AdminImportRequestsListResponse {
  requests: AdminImportRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAdminImportRequestsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | ImportRequestStatus;
}

export async function listAdminImportRequests(params: ListAdminImportRequestsParams = {}): Promise<AdminImportRequestsListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const qs = query.toString();
  const data = await apiGet(`/admin/import-requests${qs ? `?${qs}` : ''}`);
  return {
    requests: (data as { requests: AdminImportRequest[] }).requests ?? [],
    pagination: (data as { pagination: AdminImportRequestsListResponse['pagination'] }).pagination,
  };
}

export interface AdminImportRequestUpdatePayload {
  status?: ImportRequestStatus;
  adminNotes?: string | null;
  seriesId?: number | null;
}

export async function updateAdminImportRequest(id: number, updates: AdminImportRequestUpdatePayload): Promise<AdminImportRequest> {
  const data = await apiPatch(`/admin/import-requests/${id}`, updates);
  return (data as { request: AdminImportRequest }).request;
}
