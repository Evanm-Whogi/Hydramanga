import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { and, asc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { getExcludeNovelConditions } from '@/config/contentFilter';

export async function getSitemapSeries(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;

    const conditions = [or(isNull(schema.series.state), ne(schema.series.state, 'merged')), ...getExcludeNovelConditions(schema.series)];
    if (cursor && Number.isFinite(cursor)) {
      conditions.push(gt(schema.series.id, cursor));
    }

    const items = await db
      .selectDistinct({
        id: schema.series.id,
        lastUpdatedAt: schema.series.lastUpdatedAt,
      })
      .from(schema.series)
      .innerJoin(schema.chapters, eq(schema.chapters.seriesId, schema.series.id))
      .where(and(...conditions))
      .orderBy(asc(schema.series.id))
      .limit(limit);

    const nextCursor = items.length === limit ? items[items.length - 1]?.id ?? null : null;

    return res.json({
      items,
      nextCursor,
      total: items.length,
    });
  } catch (error) {
    next(error);
  }
}
