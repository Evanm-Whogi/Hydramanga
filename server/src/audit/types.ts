export type AuditActorRole = 'user' | 'admin' | 'anonymous' | 'system';

export type AuditCategory =
  | 'auth'
  | 'admin'
  | 'manga'
  | 'library'
  | 'social'
  | 'community'
  | 'settings'
  | 'moderation'
  | 'system';

export interface AuditEventInput {
  actorId?: string | null;
  impersonatorId?: string | null;
  actorRole: AuditActorRole;
  action: string;
  category: AuditCategory;
  resourceType?: string | null;
  resourceId?: string | null;
  targetUserId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  success?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Skip duplicate check when true (e.g. auth events). */
  skipDedup?: boolean;
}

export interface AuditLogRow {
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

export interface ListAdminAuditParams {
  page?: number;
  limit?: number;
  actorId?: string;
  actorName?: string;
  impersonatorId?: string;
  action?: string;
  category?: AuditCategory;
  resourceType?: string;
  resourceId?: string;
  targetUserId?: string;
  success?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface ListUserAuditParams {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}
