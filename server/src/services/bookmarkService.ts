import { db } from '@/db';
import * as schema from '@/db/schema';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import logger from '@/services/loggerService';

export const BOOKMARK_STATUSES = ['reading', 'rereading', 'planned', 'completed', 'paused', 'dropped'] as const;
export type BookmarkStatus = typeof BOOKMARK_STATUSES[number];

export type BookmarkSort = 'updated' | 'lastRead' | 'bookmarked' | 'title' | 'ranking';

export class BookmarkService {
  static async setBookmark(userId: string, seriesId: number, status: BookmarkStatus): Promise<typeof schema.seriesBookmarks.$inferSelect> {
    const existing = await db.query.seriesBookmarks.findFirst({
      where: and(eq(schema.seriesBookmarks.userId, userId), eq(schema.seriesBookmarks.seriesId, seriesId)),
    });
    const now = new Date();
    const [row] = await db.insert(schema.seriesBookmarks)
      .values({ userId, seriesId, status, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.seriesBookmarks.userId, schema.seriesBookmarks.seriesId],
        set: { status, updatedAt: now },
      })
      .returning();
    return row;
  }

  static async removeBookmark(userId: string, seriesId: number): Promise<void> {
    await db.delete(schema.seriesBookmarks)
      .where(and(eq(schema.seriesBookmarks.userId, userId), eq(schema.seriesBookmarks.seriesId, seriesId)));
  }

  static async getBookmarkStatus(userId: string, seriesId: number): Promise<BookmarkStatus | null> {
    const row = await db.query.seriesBookmarks.findFirst({
      where: and(eq(schema.seriesBookmarks.userId, userId), eq(schema.seriesBookmarks.seriesId, seriesId)),
      columns: { status: true },
    });
    return (row?.status as BookmarkStatus) ?? null;
  }

  static async getUserBookmarks(userId: string, options: {
    status?: BookmarkStatus[];
    types?: string[];
    sort?: BookmarkSort;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: any[]; total: number }> {
    const { status, types, sort = 'bookmarked', search, limit = 500, offset = 0 } = options;
    const conditions = [eq(schema.seriesBookmarks.userId, userId)];

    if (status?.length) {
      conditions.push(inArray(schema.seriesBookmarks.status, status as any));
    }
    if (types?.length) {
      conditions.push(inArray(schema.series.type, types.map((t) => t.toLowerCase())));
    }
    if (search?.trim()) {
      conditions.push(ilike(schema.series.title, `%${search.trim()}%`));
    }

    const whereClause = and(...conditions);
    const orderBy = BookmarkService.buildOrderBy(sort);

    const rows = await db
      .select({
        seriesId: schema.seriesBookmarks.seriesId,
        status: schema.seriesBookmarks.status,
        createdAt: schema.seriesBookmarks.createdAt,
        updatedAt: schema.seriesBookmarks.updatedAt,
        lastUpdatedAt: schema.series.lastUpdatedAt,
        title: schema.series.title,
        cover: schema.series.cover,
        type: schema.series.type,
        genres: schema.series.genres,
        weightedScore: schema.series.weightedScore,
        rating: schema.series.rating,
        totalChapters: schema.series.totalChapters,
        description: schema.series.description,
        views: schema.mangaViewStats.totalViews,
        year: schema.series.year,
        seriesStatus: schema.series.status,
        lastChapterId: schema.userReadingProgress.lastChapterId,
        lastPageNumber: schema.userReadingProgress.lastPageNumber,
        percentageCompleted: schema.userReadingProgress.percentageCompleted,
        lastReadAt: schema.userReadingProgress.updatedAt,
        chapterNumber: schema.chapters.chapterNumber,
        chapterTitle: schema.chapters.title,
      })
      .from(schema.seriesBookmarks)
      .innerJoin(schema.series, eq(schema.seriesBookmarks.seriesId, schema.series.id))
      .leftJoin(schema.mangaViewStats, eq(schema.mangaViewStats.seriesId, schema.series.id))
      .leftJoin(schema.userReadingProgress, and(
        eq(schema.userReadingProgress.userId, userId),
        eq(schema.userReadingProgress.seriesId, schema.seriesBookmarks.seriesId),
      ))
      .leftJoin(schema.chapters, eq(schema.userReadingProgress.lastChapterId, schema.chapters.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.seriesBookmarks)
      .innerJoin(schema.series, eq(schema.seriesBookmarks.seriesId, schema.series.id))
      .where(whereClause);

    return { items: rows, total: count };
  }

  static async getUserIdsBySeriesAndStatus(seriesId: number, statuses: BookmarkStatus[]): Promise<string[]> {
    const rows = await db
      .select({ userId: schema.seriesBookmarks.userId })
      .from(schema.seriesBookmarks)
      .where(and(
        eq(schema.seriesBookmarks.seriesId, seriesId),
        inArray(schema.seriesBookmarks.status, statuses as any),
      ));
    return [...new Set(rows.map((r) => r.userId))];
  }

  static async getSeriesIdsForUserByStatus(userId: string, statuses: BookmarkStatus[]): Promise<number[]> {
    const rows = await db
      .select({ seriesId: schema.seriesBookmarks.seriesId })
      .from(schema.seriesBookmarks)
      .where(and(
        eq(schema.seriesBookmarks.userId, userId),
        inArray(schema.seriesBookmarks.status, statuses as any),
      ));
    return rows.map((r) => r.seriesId);
  }

  static async countByStatus(userId: string, status: BookmarkStatus): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.seriesBookmarks)
      .where(and(eq(schema.seriesBookmarks.userId, userId), eq(schema.seriesBookmarks.status, status)));
    return count;
  }

  private static buildOrderBy(sort: BookmarkSort) {
    switch (sort) {
      case 'updated':
        return [desc(schema.series.lastUpdatedAt), desc(schema.seriesBookmarks.createdAt)];
      case 'lastRead':
        return [sql`${schema.userReadingProgress.updatedAt} DESC NULLS LAST`, desc(schema.seriesBookmarks.createdAt)];
      case 'title':
        return [asc(schema.series.title)];
      case 'ranking':
        return [desc(schema.series.weightedScore), desc(schema.seriesBookmarks.createdAt)];
      case 'bookmarked':
      default:
        return [desc(schema.seriesBookmarks.createdAt)];
    }
  }
}

export const bookmarkService = BookmarkService;
