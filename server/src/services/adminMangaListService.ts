import { db, schema } from '@/db/index';
import { eq, or, ilike, desc, asc, count, and, sql, SQL, isNull } from 'drizzle-orm';

export interface AdminMangaListParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sort?: 'updated' | 'title' | 'chapters';
  order?: 'asc' | 'desc';
}

export interface AdminMangaListItem {
  id: number;
  title: string | null;
  status: string | null;
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
    const { page, limit, search, status, sort = 'updated', order = 'desc' } = params;
    const offset = (page - 1) * limit;

    const filters: SQL[] = [];

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      filters.push(
        or(
          ilike(schema.series.title, term),
          ilike(schema.series.romanizedTitle, term),
          ilike(schema.series.nativeTitle, term)
        )!
      );
    }

    if (status && status !== 'all') {
      if (status === 'none') {
        filters.push(isNull(schema.mangaImportProgress.seriesId));
      } else {
        filters.push(eq(schema.mangaImportProgress.status, status as 'scanning' | 'downloading' | 'completed' | 'failed'));
      }
    }

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
        ? schema.series.title
        : sort === 'chapters'
          ? sql`coalesce(${chapterCountSq.chapterCount}, 0)`
          : sql`coalesce(${schema.mangaImportProgress.updatedAt}, ${schema.series.lastUpdatedAt})`;

    const orderBy = order === 'asc' ? asc(sortExpr) : desc(sortExpr);

    const rows = await db
      .select({
        id: schema.series.id,
        title: schema.series.title,
        status: schema.series.status,
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
      .orderBy(orderBy)
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
}

export const adminMangaListService = new AdminMangaListService();
