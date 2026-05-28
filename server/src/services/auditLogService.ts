import { Request } from 'express';
import { db, schema } from '@/db/index';
import {and, count, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { redactMetadata } from '@/audit/redact';
import { buildAuditBaseFromRequest } from '@/audit/fromRequest';
import { summarizeAuditAction } from '@/audit/summaries';
import type { AuditEventInput, AuditLogRow, ListAdminAuditParams, ListUserAuditParams} from '@/audit/types';
import logger from '@/services/loggerService';

const VIEW_DEDUP_ACTIONS = new Set(['manga.view', 'chapter.view']);
const VIEW_DEDUP_HOURS = 24;

function parseRetentionDays(): number {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS;
  if (!raw) return 90;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 90;
  return Math.floor(parsed);
}

class AuditLogService {
  get retentionDays(): number {
    return parseRetentionDays();
  }

  async record(event: AuditEventInput): Promise<void> {
    try {
      if (!event.skipDedup && VIEW_DEDUP_ACTIONS.has(event.action)) {
        const isDup = await this.isDuplicateView(event);
        if (isDup) return;
      }

      const metadata = redactMetadata({
        ...(event.metadata ?? {}),
        isAnonymous: event.actorRole === 'anonymous' || event.actorId == null,
      });

      await db.insert(schema.auditLogs).values({
        actorId: event.actorId ?? null,
        impersonatorId: event.impersonatorId ?? null,
        actorRole: event.actorRole,
        action: event.action,
        category: event.category,
        resourceType: event.resourceType ?? null,
        resourceId: event.resourceId ?? null,
        targetUserId: event.targetUserId ?? null,
        method: event.method ?? null,
        path: event.path ?? null,
        statusCode: event.statusCode ?? null,
        success: event.success ?? true,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        metadata,
      });
    } catch (error) {
      logger.error(`Failed to write audit log: ${error}`, { service: 'auditLogService' });
    }
  }

  async recordFromRequest(req: Request, event: Partial<AuditEventInput> & Pick<AuditEventInput, 'action' | 'category'>): Promise<void> {
    const base = buildAuditBaseFromRequest(req);
    await this.record({
      ...base,
      ...event,
      actorId: event.actorId !== undefined ? event.actorId : base.actorId,
      actorRole: event.actorRole ?? base.actorRole,
    });
  }

  private async isDuplicateView(event: AuditEventInput): Promise<boolean> {
    if (!event.resourceType || !event.resourceId) return false;

    const since = new Date(Date.now() - VIEW_DEDUP_HOURS * 60 * 60 * 1000);
    const conditions: SQL[] = [
      eq(schema.auditLogs.action, event.action),
      eq(schema.auditLogs.resourceType, event.resourceType),
      eq(schema.auditLogs.resourceId, event.resourceId),
      gte(schema.auditLogs.createdAt, since),
    ];

    if (event.actorId) {
      conditions.push(eq(schema.auditLogs.actorId, event.actorId));
    } else {
      conditions.push(isNull(schema.auditLogs.actorId));
      if (event.ipAddress) {
        conditions.push(eq(schema.auditLogs.ipAddress, event.ipAddress));
      }
    }

    const [row] = await db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(and(...conditions))
      .limit(1);

    return Boolean(row);
  }

  async pruneExpired(): Promise<number> {
    const days = this.retentionDays;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(schema.auditLogs)
      .where(lte(schema.auditLogs.createdAt, cutoff))
      .returning({ id: schema.auditLogs.id });
    return deleted.length;
  }

  async listForAdmin(params: ListAdminAuditParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (params.actorId) conditions.push(eq(schema.auditLogs.actorId, params.actorId));
    if (params.actorName?.trim()) {
      const nameTerm = `%${params.actorName.trim()}%`;
      conditions.push(
        or(
          ilike(schema.user.name, nameTerm),
          ilike(schema.user.username, nameTerm),
          ilike(schema.user.displayUsername, nameTerm)
        )!
      );
    }
    if (params.impersonatorId) {
      conditions.push(eq(schema.auditLogs.impersonatorId, params.impersonatorId));
    }
    if (params.action?.trim()) {
      const actionPrefix = params.action.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
      conditions.push(ilike(schema.auditLogs.action, `${actionPrefix}%`));
    }
    if (params.category) conditions.push(eq(schema.auditLogs.category, params.category));
    if (params.resourceType) {
      conditions.push(eq(schema.auditLogs.resourceType, params.resourceType));
    }
    if (params.resourceId) {
      conditions.push(eq(schema.auditLogs.resourceId, params.resourceId));
    }
    if (params.targetUserId) {
      conditions.push(eq(schema.auditLogs.targetUserId, params.targetUserId));
    }
    if (params.success !== undefined) {
      conditions.push(eq(schema.auditLogs.success, params.success));
    }
    if (params.dateFrom) {
      conditions.push(gte(schema.auditLogs.createdAt, new Date(params.dateFrom)));
    }
    if (params.dateTo) {
      conditions.push(lte(schema.auditLogs.createdAt, new Date(params.dateTo)));
    }
    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.auditLogs.path, term),
          ilike(schema.auditLogs.action, term),
          sql`${schema.auditLogs.metadata}::text ILIKE ${term}`
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const needsActorJoin = Boolean(params.actorName?.trim());

    const impersonatorUser = alias(schema.user, 'audit_impersonator');

    const countQuery = db
      .select({ total: count() })
      .from(schema.auditLogs)
      .$dynamic();

    if (needsActorJoin) {
      countQuery.leftJoin(schema.user, eq(schema.auditLogs.actorId, schema.user.id));
    }

    const [totalRow] = await countQuery.where(whereClause);

    const rows = await db
      .select({
        log: schema.auditLogs,
        actor: {
          id: schema.user.id,
          username: schema.user.username,
          displayUsername: schema.user.displayUsername,
          name: schema.user.name,
          image: schema.user.image,
        },
        impersonator: {
          id: impersonatorUser.id,
          username: impersonatorUser.username,
          displayUsername: impersonatorUser.displayUsername,
          name: impersonatorUser.name,
          image: impersonatorUser.image,
        },
      })
      .from(schema.auditLogs)
      .leftJoin(schema.user, eq(schema.auditLogs.actorId, schema.user.id))
      .leftJoin(impersonatorUser, eq(schema.auditLogs.impersonatorId, impersonatorUser.id))
      .where(whereClause)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const events: AuditLogRow[] = rows.map(({ log, actor, impersonator }) => {
      const row = this.toRow({
        ...log,
        actor: actor?.id ? actor : null,
        impersonator: impersonator?.id ? impersonator : null,
      });
      return {
        ...row,
        summary: summarizeAuditAction(
          row.action,
          row.metadata as Record<string, unknown> | null
        ),
      };
    });

    return {
      events,
      pagination: {
        page,
        limit,
        total: Number(totalRow?.total ?? 0),
        totalPages: Math.ceil(Number(totalRow?.total ?? 0) / limit) || 1,
      },
    };
  }

  async listAuthForUser(userId: string, params: ListUserAuditParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [
      eq(schema.auditLogs.actorId, userId),
      eq(schema.auditLogs.category, 'auth'),
    ];

    if (params.dateFrom) {
      conditions.push(gte(schema.auditLogs.createdAt, new Date(params.dateFrom)));
    }
    if (params.dateTo) {
      conditions.push(lte(schema.auditLogs.createdAt, new Date(params.dateTo)));
    }

    const whereClause = and(...conditions);

    const [totalRow] = await db
      .select({ total: count() })
      .from(schema.auditLogs)
      .where(whereClause);

    const rows = await db.query.auditLogs.findMany({
      where: whereClause,
      orderBy: [desc(schema.auditLogs.createdAt)],
      limit,
      offset,
    });

    const events: AuditLogRow[] = rows.map((row) => ({
      ...this.toRow(row),
      summary: summarizeAuditAction(row.action, row.metadata as Record<string, unknown> | null),
    }));

    return {
      events,
      pagination: {
        page,
        limit,
        total: Number(totalRow?.total ?? 0),
        totalPages: Math.ceil(Number(totalRow?.total ?? 0) / limit) || 1,
      },
    };
  }

  private toRow(row: {
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
    metadata: unknown;
    createdAt: Date;
    actor?: AuditLogRow['actor'];
    impersonator?: AuditLogRow['impersonator'];
  }): AuditLogRow {
    return {
      id: row.id,
      actorId: row.actorId,
      impersonatorId: row.impersonatorId,
      actorRole: row.actorRole,
      action: row.action,
      category: row.category,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      targetUserId: row.targetUserId,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      success: row.success,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor ?? null,
      impersonator: row.impersonator ?? null,
    };
  }
}

export const auditLogService = new AuditLogService();
