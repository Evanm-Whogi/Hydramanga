import { db, schema } from '@/db/index';
import { eq, or, ilike, desc, asc, count, and, sql, SQL, isNull, isNotNull } from 'drizzle-orm';
import { scraperManager } from '@/scrapers';
import { getExcludeNovelConditions } from '@/config/contentFilter';
import { seriesDisplayTitleSql } from '@/lib/seriesTitleSql';

export interface AdminMangaListParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  scraperId?: string;
  type?: string;
  sort?: 'updated' | 'title' | 'chapters' | 'type';
  order?: 'asc' | 'desc';
}

export interface AdminMangaScraperFilterOption {
  id: string;
  name: string;
  count: number;
}

export interface AdminMangaTypeFilterOption {
  id: string;
  count: number;
}

export interface AdminMangaListItem {
  id: number;
  title: string | null;
  status: string | null;
  type: string | null;
  cover: unknown;
  lastUpdatedAt: Date | null;
  chapterCount: number;
  importStatus: string | null;
  scraperId: string | null;
  errorMessage: string | null;
  importUpdatedAt: Date | null;
}

class AdminMangaListService {
  async listManga(params: AdminMangaListParams) {
    const { page, limit, search, status, scraperId, type, sort = 'updated', order = 'desc' } = params;
    const offset = (page - 1) * limit;

    const filters: SQL[] = [];

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(ilike(schema.series.searchText, term));
    }

    if (status && status !== 'all') {
      if (status === 'none') {
        filters.push(isNull(schema.mangaImportProgress.seriesId));
      } else {
        filters.push(eq(schema.mangaImportProgress.status, status as 'scanning' | 'downloading' | 'completed' | 'failed' | 'source_set'));
      }
    }

    if (scraperId && scraperId !== 'all') {
      if (scraperId === 'none') {
        filters.push(isNull(schema.mangaImportProgress.scraperId));
      } else {
        filters.push(eq(schema.mangaImportProgress.scraperId, scraperId));
      }
    }

    if (type && type !== 'all') {
      if (type === 'none') {
        filters.push(isNull(schema.series.type));
      } else {
        filters.push(eq(schema.series.type, type));
      }
    }

    filters.push(...getExcludeNovelConditions(schema.series));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const chapterCountSq = db
      .select({
        seriesId: schema.chapters.seriesId,
        chapterCount: count().as('chapter_count'),
      })
      .from(schema.chapters)
      .groupBy(schema.chapters.seriesId)
      .as('chapter_counts');

    const sortExpr =
      sort === 'title'
        ? seriesDisplayTitleSql
        : sort === 'type'
          ? sql`coalesce(${schema.series.type}, '')`
        : sort === 'chapters'
          ? sql`coalesce(${chapterCountSq.chapterCount}, 0)`
          : sql`coalesce(${schema.mangaImportProgress.updatedAt}, ${schema.series.lastUpdatedAt})`;

    const orderBy = order === 'asc' ? asc(sortExpr) : desc(sortExpr);
    const tieBreak = desc(schema.series.id);

    const rows = await db
      .select({
        id: schema.series.id,
        title: seriesDisplayTitleSql,
        status: schema.series.status,
        type: schema.series.type,
        cover: schema.series.cover,
        lastUpdatedAt: schema.series.lastUpdatedAt,
        chapterCount: sql<number>`coalesce(${chapterCountSq.chapterCount}, 0)`,
        importStatus: schema.mangaImportProgress.status,
        scraperId: schema.mangaImportProgress.scraperId,
        errorMessage: schema.mangaImportProgress.errorMessage,
        importUpdatedAt: schema.mangaImportProgress.updatedAt,
      })
      .from(schema.series)
      .leftJoin(
        schema.mangaImportProgress,
        eq(schema.series.id, schema.mangaImportProgress.seriesId)
      )
      .leftJoin(chapterCountSq, eq(schema.series.id, chapterCountSq.seriesId))
      .where(whereClause)
      .orderBy(orderBy, tieBreak)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ total: count() })
      .from(schema.series)
      .leftJoin(
        schema.mangaImportProgress,
        eq(schema.series.id, schema.mangaImportProgress.seriesId)
      )
      .where(whereClause);

    const total = Number(totalResult?.total ?? 0);

    const manga: AdminMangaListItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      type: row.type ?? null,
      cover: row.cover,
      lastUpdatedAt: row.lastUpdatedAt,
      chapterCount: Number(row.chapterCount ?? 0),
      importStatus: row.importStatus ?? null,
      scraperId: row.scraperId ?? null,
      errorMessage: row.errorMessage ?? null,
      importUpdatedAt: row.importUpdatedAt ?? null,
    }));

    return {
      manga,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getScraperFilterOptions(): Promise<AdminMangaScraperFilterOption[]> {
    const rows = await db
      .select({
        scraperId: schema.mangaImportProgress.scraperId,
        count: count(),
      })
      .from(schema.mangaImportProgress)
      .where(isNotNull(schema.mangaImportProgress.scraperId))
      .groupBy(schema.mangaImportProgress.scraperId)
      .orderBy(desc(count()));

    const nameById = new Map(
      scraperManager.getScrapers().map((s) => [s.getMetadata().id, s.getMetadata().name]),
    );

    return rows
      .filter((row): row is { scraperId: string; count: number } => row.scraperId != null)
      .map((row) => ({
        id: row.scraperId,
        name: nameById.get(row.scraperId) ?? row.scraperId,
        count: Number(row.count),
      }));
  }

  async getTypeFilterOptions(): Promise<AdminMangaTypeFilterOption[]> {
    const rows = await db
      .select({
        type: schema.series.type,
        count: count(),
      })
      .from(schema.series)
      .where(and(...getExcludeNovelConditions(schema.series)))
      .groupBy(schema.series.type)
      .orderBy(desc(count()));

    return rows
      .filter((row) => row.type?.toLowerCase().trim() !== 'novel')
      .map((row) => ({
      id: row.type ?? 'none',
      count: Number(row.count),
    }));
  }
}

export const adminMangaListService = new AdminMangaListService();
