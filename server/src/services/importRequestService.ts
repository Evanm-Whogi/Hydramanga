import { db, schema } from '@/db/index';
import { eq, or, ilike, desc, count, and, SQL } from 'drizzle-orm';
import { notificationService } from '@/services/notificationService';

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'rejected'] as const;
export type ImportRequestStatus = (typeof VALID_STATUSES)[number];

export interface CreateImportRequestInput {
  requestedTitle: string;
  requestedUrl?: string | null;
  notes?: string | null;
  seriesId?: number | null;
}

export interface AdminImportRequestListParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}

export interface ImportRequestRow {
  id: number;
  userId: string;
  seriesId: number | null;
  requestedTitle: string;
  requestedUrl: string | null;
  notes: string | null;
  adminNotes: string | null;
  status: ImportRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  userName: string;
  userEmail: string;
  seriesTitle: string | null;
}

class ImportRequestService {
  async createRequest(userId: string, input: CreateImportRequestInput) {
    const title = input.requestedTitle?.trim();
    if (!title || title.length > 500) {
      return { error: 'invalid_title' as const };
    }

    const url = input.requestedUrl?.trim() || null;
    if (url && url.length > 2000) {
      return { error: 'invalid_url' as const };
    }

    const notes = input.notes?.trim() || null;
    if (notes && notes.length > 2000) {
      return { error: 'invalid_notes' as const };
    }

    let seriesId: number | null = null;
    if (input.seriesId != null) {
      const parsed = Number(input.seriesId);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { error: 'invalid_series' as const };
      }
      const [seriesRow] = await db
        .select({ id: schema.series.id })
        .from(schema.series)
        .where(eq(schema.series.id, parsed))
        .limit(1);
      if (!seriesRow) return { error: 'series_not_found' as const };
      seriesId = parsed;
    }

    const [request] = await db
      .insert(schema.importRequests)
      .values({
        userId,
        seriesId,
        requestedTitle: title,
        requestedUrl: url,
        notes,
      })
      .returning();

    return { request };
  }

  async listForUser(userId: string) {
    const rows = await db
      .select({
        id: schema.importRequests.id,
        seriesId: schema.importRequests.seriesId,
        requestedTitle: schema.importRequests.requestedTitle,
        requestedUrl: schema.importRequests.requestedUrl,
        notes: schema.importRequests.notes,
        status: schema.importRequests.status,
        createdAt: schema.importRequests.createdAt,
        updatedAt: schema.importRequests.updatedAt,
        seriesTitle: schema.series.title,
      })
      .from(schema.importRequests)
      .leftJoin(schema.series, eq(schema.importRequests.seriesId, schema.series.id))
      .where(eq(schema.importRequests.userId, userId))
      .orderBy(desc(schema.importRequests.createdAt));

    return rows;
  }

  async listAdmin(params: AdminImportRequestListParams) {
    const { page, limit, search, status } = params;
    const offset = (page - 1) * limit;

    const filters: SQL[] = [];
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(
        or(
          ilike(schema.importRequests.requestedTitle, term),
          ilike(schema.user.name, term),
          ilike(schema.user.email, term),
          ilike(schema.series.title, term)
        )!
      );
    }
    if (status && VALID_STATUSES.includes(status as ImportRequestStatus)) {
      filters.push(eq(schema.importRequests.status, status as ImportRequestStatus));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalResult] = await Promise.all([
      db
        .select({
          id: schema.importRequests.id,
          userId: schema.importRequests.userId,
          seriesId: schema.importRequests.seriesId,
          requestedTitle: schema.importRequests.requestedTitle,
          requestedUrl: schema.importRequests.requestedUrl,
          notes: schema.importRequests.notes,
          adminNotes: schema.importRequests.adminNotes,
          status: schema.importRequests.status,
          createdAt: schema.importRequests.createdAt,
          updatedAt: schema.importRequests.updatedAt,
          userName: schema.user.name,
          userEmail: schema.user.email,
          seriesTitle: schema.series.title,
        })
        .from(schema.importRequests)
        .innerJoin(schema.user, eq(schema.importRequests.userId, schema.user.id))
        .leftJoin(schema.series, eq(schema.importRequests.seriesId, schema.series.id))
        .where(whereClause)
        .orderBy(desc(schema.importRequests.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(schema.importRequests)
        .innerJoin(schema.user, eq(schema.importRequests.userId, schema.user.id))
        .leftJoin(schema.series, eq(schema.importRequests.seriesId, schema.series.id))
        .where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      requests: rows as ImportRequestRow[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async updateAdmin(
    id: number,
    updates: {
      status?: string;
      adminNotes?: string | null;
      seriesId?: number | null;
    }
  ) {
    const [existing] = await db
      .select()
      .from(schema.importRequests)
      .where(eq(schema.importRequests.id, id))
      .limit(1);

    if (!existing) return { error: 'not_found' as const };

    const patch: Partial<typeof schema.importRequests.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) {
      if (!VALID_STATUSES.includes(updates.status as ImportRequestStatus)) {
        return { error: 'invalid_status' as const };
      }
      patch.status = updates.status as ImportRequestStatus;
    }

    if (updates.adminNotes !== undefined) {
      const adminNotes = updates.adminNotes?.trim() || null;
      if (adminNotes && adminNotes.length > 2000) {
        return { error: 'invalid_admin_notes' as const };
      }
      patch.adminNotes = adminNotes;
    }

    if (updates.seriesId !== undefined) {
      if (updates.seriesId === null) {
        patch.seriesId = null;
      } else {
        const parsed = Number(updates.seriesId);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { error: 'invalid_series' as const };
        }
        const [seriesRow] = await db
          .select({ id: schema.series.id })
          .from(schema.series)
          .where(eq(schema.series.id, parsed))
          .limit(1);
        if (!seriesRow) return { error: 'series_not_found' as const };
        patch.seriesId = parsed;
      }
    }

    if (Object.keys(patch).length <= 1) {
      return { error: 'no_changes' as const };
    }

    const [updated] = await db
      .update(schema.importRequests)
      .set(patch)
      .where(eq(schema.importRequests.id, id))
      .returning();

    if (updates.status !== undefined && updates.status !== existing.status) {
      notificationService
        .notifyImportRequestStatus({
          userId: existing.userId,
          requestedTitle: updated.requestedTitle,
          status: updated.status,
          seriesId: updated.seriesId,
        })
        .catch(() => undefined);
    }

    const adminRow = await this.getAdminById(updated.id);
    return { request: adminRow };
  }

  async getAdminById(id: number) {
    const [row] = await db
      .select({
        id: schema.importRequests.id,
        userId: schema.importRequests.userId,
        seriesId: schema.importRequests.seriesId,
        requestedTitle: schema.importRequests.requestedTitle,
        requestedUrl: schema.importRequests.requestedUrl,
        notes: schema.importRequests.notes,
        adminNotes: schema.importRequests.adminNotes,
        status: schema.importRequests.status,
        createdAt: schema.importRequests.createdAt,
        updatedAt: schema.importRequests.updatedAt,
        userName: schema.user.name,
        userEmail: schema.user.email,
        seriesTitle: schema.series.title,
      })
      .from(schema.importRequests)
      .innerJoin(schema.user, eq(schema.importRequests.userId, schema.user.id))
      .leftJoin(schema.series, eq(schema.importRequests.seriesId, schema.series.id))
      .where(eq(schema.importRequests.id, id))
      .limit(1);

    return row ?? null;
  }
}

export const importRequestService = new ImportRequestService();
