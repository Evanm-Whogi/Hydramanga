import { apiGet } from "@/lib/api";

export interface AuditLogEvent {
  id: number;
  actorId: string | null;
  impersonatorId: string | null;
  actorRole: string;
  action: string;
  category: string;
  resourceType: string | null;
  resourceId: string | null;
  targetUserId: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    username: string | null;
    displayUsername: string | null;
    name: string;
    image: string | null;
  } | null;
  impersonator?: {
    id: string;
    username: string | null;
    displayUsername: string | null;
    name: string;
    image: string | null;
  } | null;
  summary?: string;
}

export interface ListAuditParams {
  page?: number;
  limit?: number;
  actorId?: string;
  actorName?: string;
  impersonatorId?: string;
  action?: string;
  category?: string;
  resourceType?: string;
  resourceId?: string;
  targetUserId?: string;
  success?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface ListAuditResponse {
  events: AuditLogEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listAuditEvents(params: ListAuditParams = {}): Promise<ListAuditResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.actorId) qs.set("actorId", params.actorId);
  if (params.actorName) qs.set("actorName", params.actorName);
  if (params.impersonatorId) qs.set("impersonatorId", params.impersonatorId);
  if (params.action) qs.set("action", params.action);
  if (params.category) qs.set("category", params.category);
  if (params.resourceType) qs.set("resourceType", params.resourceType);
  if (params.resourceId) qs.set("resourceId", params.resourceId);
  if (params.targetUserId) qs.set("targetUserId", params.targetUserId);
  if (params.success !== undefined) qs.set("success", String(params.success));
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.search) qs.set("search", params.search);

  const query = qs.toString();
  return apiGet(`/admin/audit${query ? `?${query}` : ""}`) as Promise<ListAuditResponse>;
}
