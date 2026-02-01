import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, and, desc, inArray, isNull, asc, sql } from 'drizzle-orm';
import { metricsService } from '@/services/metricsService';
import { shouldFilterManga } from '@/config/contentFilter';
import { chapters } from '@/db/schema';
import dotenv from 'dotenv';
dotenv.config();

// Helper function to enrich manga data with view stats
async function enrichWithViewStats(mangaList: any[]) {
    if (!Array.isArray(mangaList) || mangaList.length === 0) return mangaList || [];

    const seriesIds = mangaList.map(m => m.id).filter(Boolean);
    if (seriesIds.length === 0) return mangaList;

    const viewStats = await db
        .select()
        .from(schema.mangaViewStats)
        .where(inArray(schema.mangaViewStats.seriesId, seriesIds));

    return mangaList.map(manga => {
        const stats = viewStats.find(s => s.seriesId === manga.id);
        return {
            ...manga,
            viewStats: stats
                ? {
                      totalViews: stats.totalViews,
                      uniqueViews: stats.uniqueViews,
                      lastViewedAt: stats.lastViewedAt,
                  }
                : null,
        };
    });
}

// Helper function to enrich manga data with latest chapter
async function enrichWithLatestChapter(mangaList: any[]) {
    if (!Array.isArray(mangaList) || mangaList.length === 0) return mangaList || [];

    const seriesIds = mangaList.map(m => m.id).filter(Boolean);
    if (seriesIds.length === 0) return mangaList;

    const latestRows = await db.select()
        .from(chapters)
        .where(inArray(chapters.seriesId, seriesIds))
        .orderBy(
            asc(chapters.seriesId),
            desc(sql`CAST(split_part(${chapters.chapterNumber}, '.', 1) AS INTEGER)`),
            desc(sql`CASE WHEN ${chapters.chapterNumber} LIKE '%.%' THEN CAST(split_part(${chapters.chapterNumber}, '.', 2) AS INTEGER) ELSE 0 END`)
        );

    const latestMap = new Map<number, any>();
    for (const ch of latestRows) {
        if (!latestMap.has(ch.seriesId)) latestMap.set(ch.seriesId, ch);
    }

    return mangaList.map(manga => ({
        ...manga,
        latestChapter: latestMap.get(manga.id) || null,
    }));
}

export default async function getHomePage(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const FeaturedIds = [1692, 6029, 5201, 3188, 247, 3397, 2410, 4323];
        const ITEMS_PER_ROW = 8;
        const FETCH_LIMIT = 24; // Fetch 3x to account for filtering

        // Detect user id from auth/session if available
        const userId = (req as any).user?.id || (req as any).session?.userId || null;

        const [trending, addedRaw, popularRaw, recentComments, updatedRaw, featuredRaw, upcomingRaw] = await Promise.all([
            // Trending - Using actual metrics/tracking data (7 days = week)
            metricsService.getTrendingManga(7, FETCH_LIMIT),

            // Newest
            db.query.series.findMany({
                where: eq(schema.series.year, 2026),
                orderBy: [desc(schema.series.lastUpdatedAt)],
                limit: FETCH_LIMIT,
            }),

            // Most Popular
            db.query.series.findMany({
                orderBy: [desc(schema.series.weightedScore)],
                limit: FETCH_LIMIT,
            }),

            // Recent Comments
            db.select({
                id: schema.comments.id,
                content: schema.comments.content,
                createdAt: schema.comments.createdAt,
                author: {
                    name: schema.user.name,
                    image: schema.user.image,
                },
                manga: {
                    id: schema.series.id,
                    title: schema.series.title,
                },
            })
                .from(schema.comments)
                .innerJoin(schema.user, eq(schema.comments.userId, schema.user.id))
                .innerJoin(schema.series, eq(schema.comments.seriesId, schema.series.id))
                .orderBy(desc(schema.comments.createdAt))
                .limit(8),

            // Updated
            db.query.series.findMany({
                where: isNull(schema.series.mergedWith),
                orderBy: [desc(schema.series.lastUpdatedAt)],
                limit: FETCH_LIMIT,
            }),

            // Featured
            db.query.series.findMany({
                where: inArray(schema.series.id, FeaturedIds),
                limit: FETCH_LIMIT,
            }),

            // Upcoming
            db.query.series.findMany({
                where: eq(schema.series.status, 'upcoming'),
                orderBy: [desc(schema.series.id)],
                limit: FETCH_LIMIT,
            }),
        ]);

        // Enrich trending with latest chapter first
        let trendingWithList = await enrichWithLatestChapter(Array.isArray(trending) ? trending : []);

        // Enrich all lists with view stats and latest chapter
        let [added, popular, updated, featured, upcoming] = await Promise.all([
            enrichWithViewStats(addedRaw).then(enrichWithLatestChapter),
            enrichWithViewStats(popularRaw).then(enrichWithLatestChapter),
            enrichWithViewStats(updatedRaw).then(enrichWithLatestChapter),
            enrichWithViewStats(featuredRaw).then(enrichWithLatestChapter),
            enrichWithViewStats(upcomingRaw).then(enrichWithLatestChapter),
        ]);

        // Filter out blocked content from all categories and slice to desired count
        const filterAndSlice = (list: any[]) => 
            list.filter(item => !shouldFilterManga(item.genres)).slice(0, ITEMS_PER_ROW);
        
        added = filterAndSlice(added);
        popular = filterAndSlice(popular);
        updated = filterAndSlice(updated);
        featured = filterAndSlice(featured);
        upcoming = filterAndSlice(upcoming);
        trendingWithList = filterAndSlice(trendingWithList);

        // If we have a user, fetch all userSeriesList rows for series returned above and attach them
        if (userId) {
            const collectIds = (arr: any[]) => (arr && Array.isArray(arr) ? arr.map((s: any) => s.id) : []);
            const idsSet = new Set<number>([
                ...collectIds(trendingWithList),
                ...collectIds(added),
                ...collectIds(popular),
                ...collectIds(updated),
                ...collectIds(featured),
                ...collectIds(upcoming),
            ].filter(Boolean) as number[]);

            const allIds = Array.from(idsSet);
            if (allIds.length > 0) {
                const userSeriesRows = await db
                    .select({
                        userId: schema.userSeriesList.userId,
                        seriesId: schema.userSeriesList.seriesId,
                        listId: schema.userSeriesList.listId,
                        updatedAt: schema.userSeriesList.updatedAt,
                    })
                    .from(schema.userSeriesList)
                    .where(and(eq(schema.userSeriesList.userId, userId), inArray(schema.userSeriesList.seriesId, allIds)));

                // Fetch list metadata (title/name) for the listIds referenced
                const listIds = Array.from(new Set(userSeriesRows.map((r: any) => r.listId).filter(Boolean)));
                let listsMeta: any[] = [];
                if (listIds.length > 0) {
                    listsMeta = await db
                        .select({ id: schema.userLists.id, name: schema.userLists.name })
                        .from(schema.userLists)
                        .where(inArray(schema.userLists.id, listIds));
                }

                const listTitleMap = new Map<number, string>(listsMeta.map((l: any) => [l.id, l.name]));

                const attach = (list: any[]) =>
                    (list || []).map(s => ({
                        ...s,
                        userSeriesList: userSeriesRows
                            .filter((u: any) => u.seriesId === s.id)
                            .map((u: any) => ({ ...u, listTitle: listTitleMap.get(u.listId) || null })),
                    }));

                // Attach user tracking to filtered lists
                trendingWithList = attach(trendingWithList);
                added = attach(added);
                popular = attach(popular);
                updated = attach(updated);
                featured = attach(featured);
                upcoming = attach(upcoming);
            }
        }

        return res.json({
            trending: trendingWithList,
            added,
            popular,
            recentComments,
            updated,
            featured,
            upcoming,
        });
    } catch (err) {
        return next(err);
    }
}