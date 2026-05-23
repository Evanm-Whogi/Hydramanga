import { apiGet, apiPost } from '@/lib/api';

export type ImportRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface UserImportRequest {
  id: number;
  seriesId: number | null;
  requestedTitle: string;
  requestedUrl: string | null;
  notes: string | null;
  status: ImportRequestStatus;
  createdAt: string;
  updatedAt: string;
  seriesTitle: string | null;
}

export interface CreateImportRequestPayload {
  requestedTitle: string;
  requestedUrl?: string;
  notes?: string;
  seriesId?: number;
}

export async function createImportRequest(payload: CreateImportRequestPayload): Promise<UserImportRequest> {
  const data = await apiPost('/import-requests', payload);
  return (data as { request: UserImportRequest }).request;
}

export async function listMyImportRequests(): Promise<UserImportRequest[]> {
  const data = await apiGet('/import-requests/mine');
  return (data as { requests: UserImportRequest[] }).requests ?? [];
}
