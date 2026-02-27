import { Request, Response } from 'express';
import { db, schema } from '@/db/index';
import { eq, desc, sql, getTableColumns, gte, gt, inArray, and } from 'drizzle-orm';
import { chapters, series } from '@/db/schema';
import dotenv from 'dotenv';
import { userProgressService } from '@/services/userProgressService';
import { cacheService } from '@/services/cacheService';

dotenv.config();

const newDaysInterval = '3 days';

// Cache TTLs (seconds)
const HOME_CACHE_TTL = {
    userSpecific: 2 * 60,     // 2 min: Continue Reading, Recently Added, New chapters from list
    global: 5 * 60,            // 5 min: Popular Chapters, Most Popular Manga, High Score, Most Followed, Collections, Comments
};

// Helper function to get date threshold based on period
export const getThreshold = (period: string) => {
    const now = new Date();
    switch (period) {
        case 'today': return new Date(now.setHours(0, 0, 0, 0));
        case 'week': return new Date(now.setDate(now.getDate() - 7));
        case 'month': return new Date(now.setMonth(now.getMonth() - 1));
        default: return null;
    }
};

// RECENTLY READ (No caching)
export const getRecentlyRead = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).session?.userId;
    const limit = parseInt(req.query.limit as string) || 20;
    const maxLimit = 20;

    const progress = await userProgressService.getUserProgress(userId, maxLimit);
    const progressList = Array.isArray(progress) ? progress : [];

    res.json({
        count: progressList.length,
        progress: progressList,
    });
};

// RECENTLY ADDED (Paginated)
export const getRecentlyAdded = async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const userId = (req as any).user?.id || (req as any).session?.userId;

    const cacheKey = `home:recentlyAdded:${userId ?? 'anon'}:${page}:${limit}`;
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.userSpecific },
        async () =>
            db
                .select({
                    ...getTableColumns(series),
                    latestChapterDate: sql<string>`max(${chapters.createdAt})`,
                    views: schema.mangaViewStats.totalViews,
                    isNew: sql<boolean>`exists (select 1 from ${schema.chapters} c where c.series_id = ${series.id} and c.created_at >= now() - interval ${sql.raw(`'${newDaysInterval}'`)})`.mapWith(Boolean),
                    isInUserList: userId ? sql<boolean>`exists (select 1 from ${schema.userSeriesList} usl where usl.series_id = ${series.id} and usl.user_id = ${userId})`.mapWith(Boolean) : sql<boolean>`false`,
                })
                .from(series)
                .innerJoin(chapters, eq(series.id, chapters.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .groupBy(series.id, schema.mangaViewStats.totalViews)
                .orderBy(desc(sql`max(${chapters.createdAt})`))
                .limit(limit)
                .offset(offset)
    );
    res.json(data);
};

// POPULAR CHAPTERS (Filtered by Period)
export const getPopularChapters = async (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'week';
    const threshold = getThreshold(period);
    const limit = parseInt(req.query.limit as string) || 20;

    const cacheKey = `home:popularChapters:${period}:${limit}`;
    const results = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            let subquery;
            if (threshold) {
                subquery = db.select({
                    seriesId: schema.chapterViews.seriesId,
                    chapterId: sql<number>`MAX(${schema.chapterViews.chapterId})`.as('chapter_id'),
                    viewCount: sql<number>`count(*)`.mapWith(Number).as('view_count'),
                })
                    .from(schema.chapterViews)
                    .where(gte(schema.chapterViews.viewedAt, threshold))
                    .groupBy(schema.chapterViews.seriesId)
                    .orderBy(desc(sql`count(*)`))
                    .limit(limit)
                    .as('popular_source');
            } else {
                subquery = db.select({
                    seriesId: chapters.seriesId,
                    chapterId: sql<number>`MAX(${chapters.id})`.as('chapter_id'),
                    viewCount: sql<number>`SUM(${schema.chapterViewStats.totalViews})`.mapWith(Number).as('view_count'),
                })
                    .from(schema.chapterViewStats)
                    .innerJoin(chapters, eq(chapters.id, schema.chapterViewStats.chapterId))
                    .groupBy(chapters.seriesId)
                    .orderBy(desc(sql`SUM(${schema.chapterViewStats.totalViews})`))
                    .limit(limit)
                    .as('popular_source');
            }
            return db.select({
                chapter: {
                    ...getTableColumns(chapters),
                    viewCount: subquery.viewCount,
                },
                series: {
                    ...getTableColumns(series),
                    totalMangaViews: schema.mangaViewStats.totalViews,
                    isNew: sql<boolean>`exists (select 1 from ${chapters} c where c.series_id = ${series.id} and c.created_at >= now() - interval '7 days')`.mapWith(Boolean),
                },
            })
                .from(subquery)
                .innerJoin(chapters, eq(chapters.id, subquery.chapterId))
                .innerJoin(series, eq(series.id, subquery.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .orderBy(desc(subquery.viewCount));
        }
    );
    res.json(results);
};

// POPULAR MANGA (Filtered by Period)
export const getPopularManga = async (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'week';
    const threshold = getThreshold(period);
    const limit = parseInt(req.query.limit as string) || 14;
    const userId = (req as any).user?.id || (req as any).session?.userId;

    const cacheKey = `home:popularManga:${userId ?? 'anon'}:${period}:${limit}`;
    const results = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            const query = db.select({
                ...getTableColumns(series),
                views: threshold
                    ? sql<number>`count(${schema.mangaViews.id})`.mapWith(Number)
                    : schema.mangaViewStats.totalViews,
                isNew: sql<boolean>`exists (
                    select 1 from ${schema.chapters} c 
                    where c.series_id = ${series.id} 
                    and c.created_at >= now() - interval ${sql.raw(`'${newDaysInterval}'`)}
                )`.mapWith(Boolean),
                isInUserList: userId
                    ? sql<boolean>`exists (
                        select 1 from ${schema.userSeriesList} usl 
                        where usl.series_id = ${series.id} and usl.user_id = ${userId}
                    )`.mapWith(Boolean)
                    : sql<boolean>`false`,
            })
                .from(series)
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId));

            if (threshold) {
                query.innerJoin(schema.mangaViews, eq(series.id, schema.mangaViews.seriesId))
                    .where(gte(schema.mangaViews.viewedAt, threshold))
                    .groupBy(series.id, schema.mangaViewStats.totalViews)
                    .having(sql`count(${schema.mangaViews.id}) > 0`)
                    .orderBy(desc(sql`count(${schema.mangaViews.id})`));
            } else {
                query.where(gt(schema.mangaViewStats.totalViews, 0))
                    .orderBy(desc(schema.mangaViewStats.totalViews));
            }
            return await query.limit(limit);
        }
    );
    res.json(results);
};

// HIGH SCORE MANGA (Filtered by Type)
export const getHighScores = async (req: Request, res: Response) => {
    const type = (req.query.type as string)?.toLowerCase() || 'all';
    const limit = parseInt(req.query.limit as string) || 14;
    const userId = (req as any).user?.id || (req as any).session?.userId;

    const cacheKey = `home:highScores:${userId ?? 'anon'}:${type}:${limit}`;
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () =>
            db
                .select({
                    ...getTableColumns(series),
                    views: schema.mangaViewStats.totalViews,
                    isNew: sql<boolean>`exists (
                        select 1 from ${schema.chapters} c 
                        where c.series_id = ${series.id} 
                        and c.created_at >= now() - interval ${sql.raw(`'${newDaysInterval}'`)}
                    )`.mapWith(Boolean),
                    isInUserList: userId
                        ? sql<boolean>`exists (
                            select 1 from ${schema.userSeriesList} usl 
                            where usl.series_id = ${series.id} and usl.user_id = ${userId}
                        )`.mapWith(Boolean)
                        : sql<boolean>`false`,
                })
                .from(series)
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .where(type && type !== 'all' ? eq(series.type, type) : undefined)
                .orderBy(desc(series.weightedScore))
                .limit(limit)
    );
    res.json(data);
};

// MOST FOLLOWED (Filtered by Period)
export const getMostFollowed = async (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'all';
    const threshold = getThreshold(period);
    const limit = parseInt(req.query.limit as string) || 14;
    const userId = (req as any).user?.id || (req as any).session?.userId;

    const cacheKey = `home:mostFollowed:${userId ?? 'anon'}:${period}:${limit}`;
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            const followerCounts = db
                .select({
                    seriesId: schema.userSeriesList.seriesId,
                    count: sql<number>`count(*)`.as('follower_count'),
                })
                .from(schema.userSeriesList)
                .where(threshold ? gte(schema.userSeriesList.updatedAt, threshold) : undefined)
                .groupBy(schema.userSeriesList.seriesId)
                .orderBy(desc(sql`count(*)`))
                .limit(limit)
                .as('fc');

            return db
                .select({
                    ...getTableColumns(series),
                    followerCount: followerCounts.count,
                    views: schema.mangaViewStats.totalViews,
                    isNew: sql<boolean>`exists (
                        select 1 from ${schema.chapters} c 
                        where c.series_id = ${series.id} 
                        and c.created_at >= now() - interval ${sql.raw(`'${newDaysInterval}'`)}
                    )`.mapWith(Boolean),
                    isInUserList: userId
                        ? sql<boolean>`exists (
                            select 1 from ${schema.userSeriesList} usl 
                            where usl.series_id = ${series.id} and usl.user_id = ${userId}
                        )`.mapWith(Boolean)
                        : sql<boolean>`false`,
                })
                .from(series)
                .innerJoin(followerCounts, eq(series.id, followerCounts.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .orderBy(desc(followerCounts.count));
        }
    );
    res.json(data);
};

export const getRecentChaptersFromUserList = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).session?.userId;
    if (!userId) return res.json([]);

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 30);

    const cacheKey = `home:recentChaptersFromList:${userId}:${limit}`;
    const formatted = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.userSpecific },
        async () => {
            const userSeriesIds = await db
                .selectDistinct({ seriesId: schema.userSeriesList.seriesId })
                .from(schema.userSeriesList)
                .where(eq(schema.userSeriesList.userId, userId));

            const seriesIds = userSeriesIds.map((r) => r.seriesId);
            if (seriesIds.length === 0) return [];

            const latestResult = await db.execute(sql`
                WITH recent AS (
                    SELECT series_id, id, created_at,
                           row_number() OVER (PARTITION BY series_id ORDER BY created_at DESC, id DESC) AS rn
                    FROM chapters
                    WHERE series_id = ANY(ARRAY[${sql.join(seriesIds.map((id) => sql`${id}`), sql`, `)}]::int[])
                      AND created_at >= now() - interval ${sql.raw(`'${newDaysInterval}'`)}
                )
                SELECT id AS chapter_id, series_id, created_at
                FROM recent
                WHERE rn = 1
                ORDER BY created_at DESC
                LIMIT ${limit}
            `);

            const rows = (latestResult.rows || latestResult) as Array<{ chapter_id: number }>;
            if (rows.length === 0) return [];

            const chapterIds = rows.map((r) => r.chapter_id);

            const results = await db
                .select({
                    chapter: getTableColumns(chapters),
                    series: {
                        ...getTableColumns(series),
                        views: schema.mangaViewStats.totalViews,
                        isNew: sql<boolean>`exists (
                            select 1 from ${schema.chapters} c
                            where c.series_id = ${series.id}
                            and c.created_at >= now() - interval ${sql.raw(`'${newDaysInterval}'`)}
                        )`.mapWith(Boolean),
                    },
                })
                .from(chapters)
                .innerJoin(series, eq(series.id, chapters.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .where(inArray(chapters.id, chapterIds))
                .orderBy(desc(chapters.createdAt));

            return results.map((row) => ({
                chapter: row.chapter,
                series: row.series,
            }));
        }
    );
    res.json(formatted);
};

// RECENT COMMENTS
export const getRecentComments = async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const cacheKey = `home:recentComments:${limit}`;
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        () =>
            db.query.comments.findMany({
                orderBy: [desc(schema.comments.createdAt)],
                limit: limit,
                with: { series: true, author: true },
            })
    );
    res.json(data);
};

// TOP COMMENTERS
export const getTopCommenters = async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;

    const cacheKey = `home:topCommenters:${limit}`;
    const results = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

            const query = db.select({
                id: schema.user.id,
                name: schema.user.name,
                image: schema.user.image,
                role: schema.user.role,
                totalComments: sql<number>`count(${schema.comments.id})`.mapWith(Number),
                currentPeriod: sql<number>`
                    count(${schema.comments.id}) filter (where ${schema.comments.createdAt} >= ${sevenDaysAgo})
                `.mapWith(Number),
                previousPeriod: sql<number>`
                    count(${schema.comments.id}) filter (where ${schema.comments.createdAt} >= ${fourteenDaysAgo} and ${schema.comments.createdAt} < ${sevenDaysAgo})
                `.mapWith(Number),
                trend: sql<number>`
                    case 
                        when count(${schema.comments.id}) filter (where ${schema.comments.createdAt} >= ${fourteenDaysAgo} and ${schema.comments.createdAt} < ${sevenDaysAgo}) = 0 
                        then 100
                        else round(
                            ((count(${schema.comments.id}) filter (where ${schema.comments.createdAt} >= ${sevenDaysAgo})::float - 
                              count(${schema.comments.id}) filter (where ${schema.comments.createdAt} >= ${fourteenDaysAgo} and ${schema.comments.createdAt} < ${sevenDaysAgo})::float) / 
                              nullif(count(${schema.comments.id}) filter (where ${schema.comments.createdAt} >= ${fourteenDaysAgo} and ${schema.comments.createdAt} < ${sevenDaysAgo}), 0)::float) * 100
                        )
                    end
                `.mapWith(Number),
            })
                .from(schema.user)
                .innerJoin(schema.comments, eq(schema.user.id, schema.comments.userId))
                .groupBy(schema.user.id)
                .orderBy(desc(sql`count(${schema.comments.id})`))
                .limit(limit);
            return await query;
        }
    );
    res.json(results);
};