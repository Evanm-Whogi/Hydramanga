import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';
import { CONTENT_LIMITS } from '@/lib/securityLimits';

export const DATA_EXPORT_VERSION = 2;

class DataExportService {
  async exportUserData(userId: string) {
    const seriesBookmarks = await db
      .select({
        seriesId: schema.seriesBookmarks.seriesId,
        status: schema.seriesBookmarks.status,
        createdAt: schema.seriesBookmarks.createdAt,
        updatedAt: schema.seriesBookmarks.updatedAt,
      })
      .from(schema.seriesBookmarks)
      .where(eq(schema.seriesBookmarks.userId, userId));

    const progress = await db
      .select({
        seriesId: schema.userReadingProgress.seriesId,
        lastChapterId: schema.userReadingProgress.lastChapterId,
        percentageCompleted: schema.userReadingProgress.percentageCompleted,
        totalPagesRead: schema.userReadingProgress.totalPagesRead,
        updatedAt: schema.userReadingProgress.updatedAt,
      })
      .from(schema.userReadingProgress)
      .where(eq(schema.userReadingProgress.userId, userId));

    const views = await db
      .select({
        seriesId: schema.mangaViews.seriesId,
        viewedAt: schema.mangaViews.viewedAt,
      })
      .from(schema.mangaViews)
      .where(eq(schema.mangaViews.userId, userId));

    return {
      version: DATA_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      seriesBookmarks: seriesBookmarks.map((b) => ({
        seriesId: b.seriesId,
        status: b.status,
        createdAt: b.createdAt?.toISOString(),
        updatedAt: b.updatedAt?.toISOString(),
      })),
      readingProgress: progress.map((p) => ({
        seriesId: p.seriesId,
        lastChapterId: p.lastChapterId,
        percentageCompleted: p.percentageCompleted,
        totalPagesRead: p.totalPagesRead,
        updatedAt: p.updatedAt?.toISOString(),
      })),
      viewHistory: views.map((v) => ({
        seriesId: v.seriesId,
        viewedAt: v.viewedAt?.toISOString(),
      })),
    };
  }

  async importUserData(userId: string, payload: {
    version?: number;
    seriesBookmarks?: { seriesId: number; status: string }[];
    readingProgress?: {
      seriesId: number;
      lastChapterId?: number | null;
      percentageCompleted?: number;
      totalPagesRead?: number;
    }[];
  }) {
    if ((payload.seriesBookmarks?.length ?? 0) > CONTENT_LIMITS.importMaxListItemsPerList * 10) {
      throw new Error('Too many bookmarks in import');
    }
    if ((payload.readingProgress?.length ?? 0) > CONTENT_LIMITS.importMaxProgressRows) {
      throw new Error('Too much reading progress in import');
    }

    const validStatuses = ['reading', 'rereading', 'planned', 'completed', 'paused', 'dropped'];

    if (payload.seriesBookmarks?.length) {
      for (const b of payload.seriesBookmarks) {
        if (!b.seriesId || !validStatuses.includes(b.status)) continue;
        await db
          .insert(schema.seriesBookmarks)
          .values({ userId, seriesId: b.seriesId, status: b.status as any })
          .onConflictDoUpdate({
            target: [schema.seriesBookmarks.userId, schema.seriesBookmarks.seriesId],
            set: { status: b.status as any, updatedAt: new Date() },
          });
      }
    }

    if (payload.readingProgress?.length) {
      for (const p of payload.readingProgress) {
        if (!p.seriesId) continue;
        await db
          .insert(schema.userReadingProgress)
          .values({
            userId,
            seriesId: p.seriesId,
            lastChapterId: p.lastChapterId ?? null,
            percentageCompleted: p.percentageCompleted ?? 0,
            totalPagesRead: p.totalPagesRead ?? 0,
          })
          .onConflictDoUpdate({
            target: [schema.userReadingProgress.userId, schema.userReadingProgress.seriesId],
            set: {
              lastChapterId: p.lastChapterId ?? null,
              percentageCompleted: p.percentageCompleted ?? 0,
              totalPagesRead: p.totalPagesRead ?? 0,
              updatedAt: new Date(),
            },
          });
      }
    }
  }
}

export const dataExportService = new DataExportService();
