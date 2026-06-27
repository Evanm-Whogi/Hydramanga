import { db, schema } from '@/db/index';
import { sql, and, or, eq, ne, isNull, desc } from 'drizzle-orm';
import { cacheService } from '@/services/cacheService';
import { resolveCoverUrl } from '@/lib/coverUtils';
import { seriesCardColumns, enrichSeriesListExtras } from '@/lib/seriesQueries';
import { getCatalogFilterConditions, getExcludeNovelConditions, getNsfwFilterConditions, getBlockedGenres } from '@/config/contentFilter';

const AGGREGATE_TTL = 3600; // 1h — full author aggregate is expensive to compute

export type AuthorSort = 'works' | 'name' | 'newest';

interface AuthorAggregateRow {
  name: string;
  works: number;
  type: string | null;
  recent: string | null;
}

export interface AuthorSummary {
  name: string;
  works: number;
  type: string | null;
  previewCovers: string[];
}

export interface AuthorListResult {
  authors: AuthorSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface AuthorDetail {
  name: string;
  type: string | null;
  worksCount: number;
  works: Array<Record<string, unknown>>;
}

const notMerged = or(ne(schema.series.state, 'merged'), isNull(schema.series.state));

/** First grouping character for the A–Z filter; non-letters bucket under "#". */
function letterBucket(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

class AuthorService {
  /** Full author aggregate (cached). Search / letter / sort / pagination happen in JS over this. */
  private async getAggregate(): Promise<AuthorAggregateRow[]> {
    return cacheService.getOrSet({ key: 'authors:agg:v1', ttl: AGGREGATE_TTL }, async () => {
      const serverBlocksNsfw = getBlockedGenres().length > 0;
      const conditions = [
        sql`${schema.series.authors} IS NOT NULL AND jsonb_typeof(${schema.series.authors}) = 'array'`,
        sql`btrim(author) <> ''`,
        ...getExcludeNovelConditions(schema.series),
        ...getNsfwFilterConditions(serverBlocksNsfw, schema.series),
        notMerged!,
      ];
      const whereSql = sql.join(conditions, sql` AND `);

      const result = await db.execute(sql`
        SELECT author AS name,
               COUNT(*)::int AS works,
               MODE() WITHIN GROUP (ORDER BY ${schema.series.type}) AS type,
               MAX(${schema.series.lastUpdatedAt}) AS recent
        FROM ${schema.series}, jsonb_array_elements_text(${schema.series.authors}) AS author
        WHERE ${whereSql}
        GROUP BY author
      `);

      const rows = (result.rows ?? result) as unknown as AuthorAggregateRow[];
      return rows.map((r) => ({
        name: r.name,
        works: Number(r.works),
        type: r.type,
        recent: r.recent ? new Date(r.recent).toISOString() : null,
      }));
    });
  }

  async listAuthors(params: { search?: string; letter?: string; sort?: AuthorSort; page?: number; limit?: number; hideNsfw?: boolean }): Promise<AuthorListResult> {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 48);
    const sort = params.sort ?? 'works';
    const search = params.search?.trim().toLowerCase();
    const letter = params.letter?.trim().toUpperCase();

    let rows = await this.getAggregate();

    if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search));
    if (letter) rows = rows.filter((r) => letterBucket(r.name) === letter);

    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'newest') return (b.recent ?? '').localeCompare(a.recent ?? '');
      // works (default) — tie-break by name
      return b.works - a.works || a.name.localeCompare(b.name);
    });

    const total = rows.length;
    const pageRows = rows.slice((page - 1) * limit, (page - 1) * limit + limit);
    const coverMap = await this.fetchPreviewCovers(pageRows.map((r) => r.name), params.hideNsfw ?? false);

    return {
      authors: pageRows.map((r) => ({
        name: r.name,
        works: r.works,
        type: r.type,
        previewCovers: coverMap.get(r.name) ?? [],
      })),
      total,
      page,
      limit,
    };
  }

  async getTopAuthors(limit = 10, hideNsfw = false): Promise<AuthorSummary[]> {
    const rows = await this.getAggregate();
    const top = [...rows]
      .sort((a, b) => b.works - a.works || a.name.localeCompare(b.name))
      .slice(0, Math.min(Math.max(limit, 1), 30));
    const coverMap = await this.fetchPreviewCovers(top.map((r) => r.name), hideNsfw);
    return top.map((r) => ({ name: r.name, works: r.works, type: r.type, previewCovers: coverMap.get(r.name) ?? [] }));
  }

  /** Top `perAuthor` covers (by weighted score) for each requested author name. */
  private async fetchPreviewCovers(names: string[], hideNsfw: boolean, perAuthor = 4): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (names.length === 0) return map;

    const serverBlocksNsfw = getBlockedGenres().length > 0;
    const namesArray = sql`ARRAY[${sql.join(names.map((n) => sql`${n}`), sql`, `)}]::text[]`;
    const conditions = [
      sql`author = ANY(${namesArray})`,
      ...getExcludeNovelConditions(schema.series),
      ...getNsfwFilterConditions(hideNsfw || serverBlocksNsfw, schema.series),
      notMerged!,
    ];
    const whereSql = sql.join(conditions, sql` AND `);

    const result = await db.execute(sql`
      SELECT name, cover FROM (
        SELECT author AS name,
               ${schema.series.cover} AS cover,
               ROW_NUMBER() OVER (PARTITION BY author ORDER BY ${schema.series.weightedScore} DESC NULLS LAST) AS rn
        FROM ${schema.series}, jsonb_array_elements_text(${schema.series.authors}) AS author
        WHERE ${whereSql}
      ) t
      WHERE rn <= ${perAuthor}
    `);

    const rows = (result.rows ?? result) as unknown as Array<{ name: string; cover: unknown }>;
    for (const row of rows) {
      const url = resolveCoverUrl(row.cover);
      if (!url) continue;
      const existing = map.get(row.name) ?? [];
      if (existing.length < perAuthor) {
        existing.push(url);
        map.set(row.name, existing);
      }
    }
    return map;
  }

  async getAuthorDetail(name: string, hideNsfw = false): Promise<AuthorDetail | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const conditions = [
      sql`${schema.series.authors} @> ${JSON.stringify([trimmed])}::jsonb`,
      ...getCatalogFilterConditions(hideNsfw, schema.series),
      notMerged!,
    ];

    const rows = await db
      .select({ ...seriesCardColumns, views: schema.mangaViewStats.totalViews })
      .from(schema.series)
      .leftJoin(schema.mangaViewStats, eq(schema.mangaViewStats.seriesId, schema.series.id))
      .where(and(...conditions))
      .orderBy(desc(schema.series.weightedScore));

    if (rows.length === 0) return null;

    const works = await enrichSeriesListExtras(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        nativeTitle: row.nativeTitle,
        romanizedTitle: row.romanizedTitle,
        cover: row.cover,
        type: row.type,
        status: row.status,
        rating: row.rating,
        views: row.views ?? 0,
        totalChapters: row.totalChapters,
      }))
    );

    // Dominant media type across the author's works
    const typeCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.type) typeCounts.set(row.type, (typeCounts.get(row.type) ?? 0) + 1);
    }
    const type = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return { name: trimmed, type, worksCount: works.length, works };
  }
}

export const authorService = new AuthorService();
