import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { and, asc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { getExcludeNovelConditions } from '@/config/contentFilter';
import { authorService } from '@/services/authorService';

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

export async function getSitemapAuthors(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 10000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await authorService.listForSitemap({ limit, offset });
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getSitemapLists(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;

    const conditions = [eq(schema.curatedLists.visibility, 'public')];
    if (cursor && Number.isFinite(cursor)) {
      conditions.push(gt(schema.curatedLists.id, cursor));
    }

    const items = await db
      .select({
        id: schema.curatedLists.id,
        lastUpdatedAt: schema.curatedLists.updatedAt,
      })
      .from(schema.curatedLists)
      .where(and(...conditions))
      .orderBy(asc(schema.curatedLists.id))
      .limit(limit);

    const nextCursor = items.length === limit ? items[items.length - 1]?.id ?? null : null;

    return res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
}

export async function getSitemapForum(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;

    const conditions = [eq(schema.boardPosts.isDeleted, false)];
    if (cursor && Number.isFinite(cursor)) {
      conditions.push(gt(schema.boardPosts.id, cursor));
    }

    const items = await db
      .select({
        id: schema.boardPosts.id,
        lastUpdatedAt: schema.boardPosts.updatedAt,
      })
      .from(schema.boardPosts)
      .where(and(...conditions))
      .orderBy(asc(schema.boardPosts.id))
      .limit(limit);

    const nextCursor = items.length === limit ? items[items.length - 1]?.id ?? null : null;

    return res.json({ items, nextCursor });
  } catch (error) {
    next(error);
  }
}
