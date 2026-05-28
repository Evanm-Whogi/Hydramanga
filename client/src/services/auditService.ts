import { apiGet } from "@/lib/api";

export interface MyAuditEvent {
  id: number;
  action: string;
  category: string;
  success: boolean;
  createdAt: string;
  summary?: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface MyAuditResponse {
  events: MyAuditEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getMyAuthActivity(params?: {page?: number; limit?: number}): Promise<MyAuditResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return apiGet(`/users/me/audit${query ? `?${query}` : ""}`) as Promise<MyAuditResponse>;
}
