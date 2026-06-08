import { Request, Response } from 'express';
import { db, schema } from '@/db/index';
import { eq, desc, sql, gte, gt, inArray, and, getTableColumns } from 'drizzle-orm';
import { chapters, series } from '@/db/schema';
import dotenv from 'dotenv';
import { userProgressService } from '@/services/userProgressService';
import { cacheService } from '@/services/cacheService';
import { getUserSettings } from '@/services/userSettingsService';
import { getNsfwFilterConditions } from '@/config/contentFilter';
import { enrichNestedSeriesExtras, enrichSeriesListExtras, seriesCardColumns} from '@/lib/seriesQueries';
import { badgeService } from '@/services/badgeService';

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
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

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
    const userId = req.user?.id;
    const { hideNsfw } = await getUserSettings(userId);

    const cacheKey = `home:recentlyAdded:${hideNsfw}:${page}:${limit}`;
    const nsfwConditions = getNsfwFilterConditions(hideNsfw, series);
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.userSpecific },
        async () => {
            const base = db
                .select({
                    ...seriesCardColumns,
                    latestChapterDate: sql<string>`max(${chapters.createdAt})`,
                    views: sql<number>`max(${schema.mangaViewStats.totalViews})`.mapWith(Number),
                })
                .from(series)
                .innerJoin(chapters, eq(series.id, chapters.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId));
            const withWhere = nsfwConditions.length ? base.where(and(...nsfwConditions)) : base;
            const rows = await withWhere
                .groupBy(series.id)
                .orderBy(desc(sql`max(${chapters.createdAt})`))
                .limit(limit)
                .offset(offset);
            return enrichSeriesListExtras(rows, newDaysInterval);
        }
    );
    res.json(data);
};

// POPULAR CHAPTERS (Filtered by Period)
export const getPopularChapters = async (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'week';
    const threshold = getThreshold(period);
    const limit = parseInt(req.query.limit as string) || 20;
    const userId = req.user?.id;
    const { hideNsfw } = await getUserSettings(userId);

    const cacheKey = `home:popularChapters:${hideNsfw}:${period}:${limit}`;
    const nsfwConditions = getNsfwFilterConditions(hideNsfw, series);
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
            const base = db.select({
                chapter: {
                    ...getTableColumns(chapters),
                    viewCount: subquery.viewCount,
                },
                series: {
                    ...seriesCardColumns,
                    totalMangaViews: schema.mangaViewStats.totalViews,
                },
            })
                .from(subquery)
                .innerJoin(chapters, eq(chapters.id, subquery.chapterId))
                .innerJoin(series, eq(series.id, subquery.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId));
            const withWhere = nsfwConditions.length ? base.where(and(...nsfwConditions)) : base;
            const rows = await withWhere.orderBy(desc(subquery.viewCount));
            return enrichNestedSeriesExtras(rows, newDaysInterval);
        }
    );
    res.json(results);
};

// POPULAR MANGA (Filtered by Period)
export const getPopularManga = async (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'week';
    const threshold = getThreshold(period);
    const limit = parseInt(req.query.limit as string) || 14;
    const userId = req.user?.id;
    const { hideNsfw } = await getUserSettings(userId);

    const cacheKey = `home:popularManga:${hideNsfw}:${period}:${limit}`;
    const nsfwConditions = getNsfwFilterConditions(hideNsfw, series);
    const results = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            const baseConditions = nsfwConditions.length ? and(...nsfwConditions) : undefined;

            if (threshold) {
                const popularByViews = db
                    .select({
                        seriesId: schema.mangaViews.seriesId,
                        views: sql<number>`count(*)`.mapWith(Number).as('period_views'),
                    })
                    .from(schema.mangaViews)
                    .innerJoin(series, eq(series.id, schema.mangaViews.seriesId))
                    .where(
                        baseConditions
                            ? and(gte(schema.mangaViews.viewedAt, threshold), baseConditions)
                            : gte(schema.mangaViews.viewedAt, threshold),
                    )
                    .groupBy(schema.mangaViews.seriesId)
                    .having(sql`count(*) > 0`)
                    .orderBy(desc(sql`count(*)`))
                    .limit(limit)
                    .as('popular_by_views');

                const rows = await db
                    .select({
                        ...seriesCardColumns,
                        views: popularByViews.views,
                    })
                    .from(popularByViews)
                    .innerJoin(series, eq(series.id, popularByViews.seriesId))
                    .orderBy(desc(popularByViews.views));

                return enrichSeriesListExtras(rows, newDaysInterval);
            }

            const rows = await db
                .select({
                    ...seriesCardColumns,
                    views: schema.mangaViewStats.totalViews,
                })
                .from(series)
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .where(baseConditions ? and(gt(schema.mangaViewStats.totalViews, 0), baseConditions) : gt(schema.mangaViewStats.totalViews, 0))
                .orderBy(desc(schema.mangaViewStats.totalViews))
                .limit(limit);

            return enrichSeriesListExtras(rows, newDaysInterval);
        }
    );
    res.json(results);
};

// HIGH SCORE MANGA (Filtered by Type)
export const getHighScores = async (req: Request, res: Response) => {
    const type = (req.query.type as string)?.toLowerCase() || 'all';
    const limit = parseInt(req.query.limit as string) || 14;
    const userId = req.user?.id;
    const { hideNsfw } = await getUserSettings(userId);

    const cacheKey = `home:highScores:${hideNsfw}:${type}:${limit}`;
    const nsfwConditions = getNsfwFilterConditions(hideNsfw, series);
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            const typeCondition = type && type !== 'all' ? eq(series.type, type) : undefined;
            const whereClause = [typeCondition, ...nsfwConditions].filter(Boolean);
            const rows = await db
                .select({
                    ...seriesCardColumns,
                    views: schema.mangaViewStats.totalViews,
                })
                .from(series)
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .where(whereClause.length ? and(...(whereClause as any)) : undefined)
                .orderBy(desc(series.weightedScore))
                .limit(limit);
            return enrichSeriesListExtras(rows, newDaysInterval);
        }
    );
    res.json(data);
};

// MOST FOLLOWED (Filtered by Period)
export const getMostFollowed = async (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'all';
    const threshold = getThreshold(period);
    const limit = parseInt(req.query.limit as string) || 14;
    const userId = req.user?.id;
    const { hideNsfw } = await getUserSettings(userId);

    const cacheKey = `home:mostFollowed:${hideNsfw}:${period}:${limit}`;
    const nsfwConditions = getNsfwFilterConditions(hideNsfw, series);
    const data = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.global },
        async () => {
            const followerCounts = db
                .select({
                    seriesId: schema.seriesBookmarks.seriesId,
                    count: sql<number>`count(*)`.as('follower_count'),
                })
                .from(schema.seriesBookmarks)
                .where(threshold ? gte(schema.seriesBookmarks.updatedAt, threshold) : undefined)
                .groupBy(schema.seriesBookmarks.seriesId)
                .orderBy(desc(sql`count(*)`))
                .limit(limit)
                .as('fc');

            const rows = await db
                .select({
                    ...seriesCardColumns,
                    followerCount: followerCounts.count,
                    views: schema.mangaViewStats.totalViews,
                })
                .from(series)
                .innerJoin(followerCounts, eq(series.id, followerCounts.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .where(nsfwConditions.length ? and(...nsfwConditions) : undefined)
                .orderBy(desc(followerCounts.count))
                .limit(limit);

            return enrichSeriesListExtras(rows, newDaysInterval);
        }
    );
    res.json(data);
};

export const getRecentChaptersFromUserList = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 30);
    const { hideNsfw } = await getUserSettings(userId);

    const cacheKey = `home:recentChaptersFromList:${userId}:${hideNsfw}:${limit}`;
    const nsfwConditions = getNsfwFilterConditions(hideNsfw, series);
    const formatted = await cacheService.getOrSet(
        { key: cacheKey, ttl: HOME_CACHE_TTL.userSpecific },
        async () => {
            const userSeriesIds = await db
                .selectDistinct({ seriesId: schema.seriesBookmarks.seriesId })
                .from(schema.seriesBookmarks)
                .where(and(
                    eq(schema.seriesBookmarks.userId, userId),
                    inArray(schema.seriesBookmarks.status, ['reading', 'rereading']),
                ));

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

            const whereClause = nsfwConditions.length
                ? and(inArray(chapters.id, chapterIds), ...nsfwConditions)
                : inArray(chapters.id, chapterIds);
            const results = await db
                .select({
                    chapter: getTableColumns(chapters),
                    series: {
                        ...seriesCardColumns,
                        views: schema.mangaViewStats.totalViews,
                    },
                })
                .from(chapters)
                .innerJoin(series, eq(series.id, chapters.seriesId))
                .leftJoin(schema.mangaViewStats, eq(series.id, schema.mangaViewStats.seriesId))
                .where(whereClause)
                .orderBy(desc(chapters.createdAt));

            return enrichNestedSeriesExtras(
                results.map((row) => ({ chapter: row.chapter, series: row.series })),
                newDaysInterval,
            );
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
                username: schema.user.username,
                displayUsername: schema.user.displayUsername,
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
    const userIds = results.map((r) => r.id);
    const badgeMap = await badgeService.getBadgesForUsers(userIds);
    const enriched = results.map((row) => ({ ...row, badges: badgeMap[row.id] ?? [] }));
    res.json(enriched);
};
