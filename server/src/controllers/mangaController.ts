import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, inArray, isNull, ilike, ne, getTableColumns, isNotNull, gt, notLike, lte, gte } from 'drizzle-orm';
import { chapters, series } from '@/db/schema';
import path from 'path';
import fs from 'fs-extra';
import logger from '@/services/loggerService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import { metricsService } from '@/services/metricsService';
import { shouldFilterManga, getBlockedGenres } from '@/config/contentFilter';
import { mangaProgressService } from '@/services/mangaProgressService';
import { cacheService } from '@/services/cacheService';
import axios from 'axios';
import { getCollectionsList } from '@/services/collectionsService';

// Helper function to enrich manga data with view stats
async function enrichWithViewStats(mangaList: any[]) {
    if (mangaList.length === 0) return [];
    
    const seriesIds = mangaList.map(m => m.id);
    const viewStats = await db
        .select()
        .from(schema.mangaViewStats)
        .where(inArray(schema.mangaViewStats.seriesId, seriesIds));
    
    return mangaList.map(manga => {
        const stats = viewStats.find(s => s.seriesId === manga.id);
        return {
            ...manga,
            viewStats: stats ? {
                totalViews: stats.totalViews,
                uniqueViews: stats.uniqueViews,
                lastViewedAt: stats.lastViewedAt,
            } : null,
        };
    });
}

// Helper function to enrich manga data with latest chapter
async function enrichWithLatestChapter(mangaList: any[]) {
    if (!Array.isArray(mangaList) || mangaList.length === 0) return mangaList || [];

    const seriesIds = mangaList.map((m: any) => m.id).filter(Boolean);
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

    return mangaList.map((manga: any) => ({
        ...manga,
        latestChapter: latestMap.get(manga.id) || null,
    }));
}

// Search manga with filters, sorting, and pagination (Infinite Scroll)
export async function searchManga(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const { genres, tags, type, status, search, years, nsfw, sort = "weightedScore", order = "desc", cursor, limit = "40" } = req.query;
        const pageSize = Math.min(Number(limit), 40);
        const isAsc = String(order).toLowerCase() === 'asc';
        const userId = (req as any).user?.id || (req as any).session?.userId;
        const NEW_INTERVAL = '3 days';

        const normalizeQueryForCache = (query: Request['query']) => {
            const entries = Object.entries(query)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => {
                    if (Array.isArray(value)) {
                        return [key, value.map(v => String(v)).sort()];
                    }
                    return [key, String(value)];
                })
                .sort(([a]: any, [b]: any) => a.localeCompare(b));

            return JSON.stringify(entries);
        };

        const cacheKey = `manga:search:${userId || 'anon'}:${normalizeQueryForCache(req.query)}`;
        const cacheTtlSeconds = 5 * 60;

        const conditions: any = [];

        const parseParam = (param: any) => {
            if (!param) return [];
            return (Array.isArray(param) ? param : String(param).split(',')).map(v => v.trim()).filter(Boolean);
        };

        // 1. Filter Logic
        if (search) {
            const pattern = `%${String(search).trim()}%`;
            conditions.push(or(
                ilike(schema.series.title, pattern), 
                ilike(schema.series.romanizedTitle, pattern), 
                ilike(schema.series.nativeTitle, pattern)
            ));
        }

        const genreList = parseParam(genres);
        genreList.forEach(g => {
            conditions.push(sql`${schema.series.genres} @> ${JSON.stringify([g])}::jsonb`);
        });

        const tagList = parseParam(tags);
        tagList.forEach(tag => {
            conditions.push(sql`${schema.series.tags} @> ${JSON.stringify([tag])}::jsonb`);
        });

        const typeList = parseParam(type).map(t => t.toLowerCase());
        if (typeList.length > 0) conditions.push(inArray(schema.series.type, typeList));

        const statusList = parseParam(status);
        if (statusList.length > 0) conditions.push(inArray(schema.series.status, statusList));

        // Year/Decade Logic
        const yearList = parseParam(years);
        if (yearList.length > 0) {
            const yearConditions = yearList.map(year => {
                if (year === 'timeless') return isNull(schema.series.year);
                if (year.endsWith('s')) {
                    const start = parseInt(year);
                    return and(isNotNull(schema.series.year), gte(schema.series.year, start), lte(schema.series.year, start + 9));
                }
                return eq(schema.series.year, parseInt(year));
            });
            conditions.push(or(...yearConditions));
        }

        // Content Restrictions
        if (nsfw === 'false') {
            conditions.push(and(ne(schema.series.contentRating, 'erotica'), ne(schema.series.contentRating, 'pornographic')));
        }
        getBlockedGenres().forEach(bg => {
            conditions.push(sql`NOT (${schema.series.genres} @> ${JSON.stringify([bg])}::jsonb)`);
        });
        conditions.push(or(ne(schema.series.state, 'merged'), isNull(schema.series.state)));

        // 2. Sorting & Pagination Setup
        const columns = getTableColumns(schema.series);
        const sortKey = (sort as keyof typeof columns) || 'weightedScore';
        const effectiveSort = sortKey === 'totalChapters' 
            ? sql`NULLIF(${schema.series.totalChapters}, '')::int` 
            : columns[sortKey];

        if (cursor) {
            const [cursorVal, cursorId] = String(cursor).split('|');
            const operator = isAsc ? sql`>` : sql`<`;
            const typedVal = (sortKey === 'totalChapters' || typeof columns[sortKey] === 'number') ? Number(cursorVal) : cursorVal;
            conditions.push(sql`(${effectiveSort}, ${schema.series.id}) ${operator} (${typedVal}, ${Number(cursorId)})`);
        }

        const payload = await cacheService.getOrSet({
                key: cacheKey,
                ttl: cacheTtlSeconds,
                staleIfError: cacheTtlSeconds,
            },
            async () => {
                // 3. Main Execution (Aggregating views and flags)
                const [totalCountResult] = await db.select({ count: count() }).from(schema.series).where(and(...conditions));

                const data = await db
                    .select({
                        ...columns,
                        views: schema.mangaViewStats.totalViews,
                        uniqueViews: schema.mangaViewStats.uniqueViews,
                        // Request 1: Is New (chapter in last X days)
                        isNew: sql<boolean>`EXISTS (
                            SELECT 1 FROM ${schema.chapters} c 
                            WHERE c.series_id = ${schema.series.id} 
                            AND c.created_at >= NOW() - INTERVAL ${sql.raw(`'${NEW_INTERVAL}'`)}
                        )`.mapWith(Boolean),
                        // Request 2: Is In User List
                        isInUserList: userId ? sql<boolean>`EXISTS (
                            SELECT 1 FROM ${schema.userSeriesList} usl 
                            WHERE usl.series_id = ${schema.series.id} 
                            AND usl.user_id = ${userId}
                        )`.mapWith(Boolean) : sql<boolean>`false`.mapWith(Boolean),
                        // Request 3: Follower Count
                        followerCount: sql<number>`(
                            SELECT COUNT(*) FROM ${schema.userSeriesList} usl 
                            WHERE usl.series_id = ${schema.series.id}
                        )`,
                    })
                    .from(schema.series)
                    .leftJoin(schema.mangaViewStats, eq(schema.series.id, schema.mangaViewStats.seriesId))
                    .where(and(...conditions))
                    .orderBy(
                        isAsc ? asc(effectiveSort) : desc(effectiveSort), 
                        isAsc ? asc(schema.series.id) : desc(schema.series.id)
                    )
                    .limit(pageSize + 1);

                const hasNextPage = data.length > pageSize;
                const items = hasNextPage ? data.slice(0, -1) : data;
                const seriesIds = items.map(m => m.id);

                // 4. Optimized Latest Chapter Fetch (Batch only for the visible items)
                let itemsWithChapters: any[] = items; 

                if (seriesIds.length > 0) {
                    const latestChapters = await db.selectDistinctOn([schema.chapters.seriesId])
                        .from(schema.chapters)
                        .where(inArray(schema.chapters.seriesId, seriesIds))
                        .orderBy(
                            schema.chapters.seriesId,
                            desc(sql`CAST(split_part(${schema.chapters.chapterNumber}, '.', 1) AS INTEGER)`),
                            desc(sql`CASE WHEN ${schema.chapters.chapterNumber} LIKE '%.%' THEN CAST(split_part(${schema.chapters.chapterNumber}, '.', 2) AS INTEGER) ELSE 0 END`)
                        );

                    const chapterMap = new Map(latestChapters.map(c => [c.seriesId, c]));
                    
                    // By mapping directly here, TypeScript infers the combined type correctly
                    itemsWithChapters = items.map(item => ({
                        ...item,
                        latestChapter: chapterMap.get(item.id) || null
                    }));
                } else {
                    // If no series, just map the empty chapters
                    itemsWithChapters = items.map(item => ({ ...item, latestChapter: null }));
                }

                // 5. Build Cursor
                let nextCursor = null;
                if (hasNextPage) {
                    const last = items[items.length - 1];
                    const val = last[sortKey as keyof typeof last] ?? 0;
                    nextCursor = `${val}|${last.id}`;
                }

                return {
                    meta: {
                        total: Number(totalCountResult?.count || 0),
                        hasNextPage,
                        sort,
                        order: isAsc ? 'asc' : 'desc'
                    },
                    items: itemsWithChapters,
                    nextCursor
                };
            }
        );

        return res.json(payload);

    } catch (error) {
        return next(error);
    }
}

export async function getMangaTags(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const cacheKey = 'manga:tags:all';
        const cacheTtlSeconds = 7 * 24 * 60 * 60;

        const tags = await cacheService.getOrSet(
            {
                key: cacheKey,
                ttl: cacheTtlSeconds,
                staleIfError: cacheTtlSeconds,
            },
            async () => {
                const results = await db.execute(sql`
                    SELECT DISTINCT jsonb_array_elements_text(${schema.series.tags}) as tag
                    FROM ${schema.series}
                    WHERE ${schema.series.tags} IS NOT NULL
                    ORDER BY tag ASC
                `);

                const rows = (results.rows || results) as Array<{ tag?: string | null }>;
                return rows.map(row => row.tag).filter((tag): tag is string => Boolean(tag));
            }
        );

        return res.json({ tags });
    } catch (error) {
        return next(error);
    }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id;

    // Validate ID before any operations
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ status: 400, message: "Invalid manga ID" });
    }

    // For unauthenticated users/bots, return only public data for metadata
    if (!userId) {
        const publicData = await db.query.series.findFirst({
            where: (series, { eq }) => eq(series.id, id),
            columns: {
                id: true,
                title: true,
                romanizedTitle: true,
                description: true,
                cover: true,
            },
        });

        if (!publicData) {
            return res.status(404).json({ status: 404, message: "Not found" });
        }

        return res.json({
            status: 200,
            manga: publicData,
            userStatus: null
        });
    }

    // For authenticated users, return full data with user-specific info
    const mangaData = await db.query.series.findFirst({
        where: (series, { eq }) => eq(series.id, id),
        with: {
        chapters: {
            columns: {
                id: true,
                seriesId: true,
                title: true,
                chapterNumber: true,
                createdAt: true,
                updatedAt: true,
                pageCount: true,
                scraperId: true,
            },
            orderBy: (chapters, { asc }) => [asc(chapters.chapterNumber)],

        },
        comments: {
            where: (comments, { isNull }) => isNull(comments.parentId),
            with: {
                author: {
                    columns: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
                votes: true,
                replies: {
                    with: {
                        author: {
                            columns: {
                                id: true,
                                name: true,
                                image: true,
                            },
                        },
                        votes: true,
                    },
                    orderBy: (comments, { asc }) => [asc(comments.createdAt)],
                },
            },
            orderBy: (comments, { desc }) => [desc(comments.createdAt)],
        },
        usersTracking: { where: (ut, { eq }) => eq(ut.userId, userId) },
        },
    });
    if(!mangaData) return res.json({status: 404, message: "Not found"});

    // Get user's list information if they're tracking this manga
    const userListInfo = mangaData.usersTracking?.[0];
    let userStatus = null;
    if (userListInfo?.listId) {
        const userList = await db.query.userLists.findFirst({
            where: eq(schema.userLists.id, userListInfo.listId),
        });
        userStatus = userList ? { listId: userList.id, listName: userList.name, listSlug: userList.slug } : null;
    }
    const { usersTracking, ...manga } = mangaData;

    // Fetch chapter view stats for all chapters
    const chapterViewStats = await metricsService.getSeriesChapterStats(id);
    
    // Enrich chapters with view stats
    const enrichedChapters = manga.chapters.map((chapter: any) => {
        const stats = chapterViewStats.find((s: any) => s.chapterId === chapter.id);
        return {
            ...chapter,
            viewStats: stats ? {
                totalViews: stats.totalViews,
                uniqueViews: stats.uniqueViews,
                lastViewedAt: stats.lastViewedAt,
            } : {
                totalViews: 0,
                uniqueViews: 0,
                lastViewedAt: null,
            },
        };
    });

    // Replace chapters with enriched chapters
    manga.chapters = enrichedChapters;

    // Fetch related series data
    let enrichedRelationships: any = null;
    if (manga.relationships && typeof manga.relationships === 'object' && !Array.isArray(manga.relationships)) {
        // Extract all IDs from all relationship categories
        const relationshipIds: number[] = [];
        Object.values(manga.relationships).forEach((ids: any) => {
            if (Array.isArray(ids)) {
                relationshipIds.push(...ids.filter((id: any) => id !== undefined && id !== null));
            }
        });
        
        if (relationshipIds.length > 0) {
            const relatedSeries = await db.select({
                id: schema.series.id,
                name: schema.series.title,
                image: schema.series.cover,
            })
            .from(schema.series)
            .where(inArray(schema.series.id, relationshipIds));
            
            // Enrich the relationships object with fetched data
            enrichedRelationships = {};
            Object.entries(manga.relationships).forEach(([category, ids]: [string, any]) => {
                enrichedRelationships[category] = ids.map((id: number) => {
                    const relatedData = relatedSeries.find((s) => s.id === id);
                    return relatedData || { id };
                });
            });
        }
    }

    return res.json({
        status: 200,
        manga: enrichedRelationships ? { ...manga, relationships: enrichedRelationships } : manga,
        userStatus
    })
}

// Aggregate endpoint: Get all lists with their manga items for the lists page
export async function getAllLists(req: Request, res: Response) {
    const userId = req.user.id;

    // Ensure user has default lists
    const { ensureDefaultLists } = await import('./listController');
    await ensureDefaultLists(userId);

    // Get all user lists (include hidden for management)
    const userLists = await db.query.userLists.findMany({
        where: eq(schema.userLists.userId, userId),
        orderBy: (userLists, { asc }) => [asc(userLists.sortOrder)],
    });

    // Get all series list items
    const results = await db.query.userSeriesList.findMany({
        where: eq(schema.userSeriesList.userId, userId),
        with: {
            series: true,
            list: true,
        },
        orderBy: (userSeriesList, { desc }) => [desc(userSeriesList.updatedAt)],
    });

    // Recently added (last 20 items across all lists)
    const addedRaw = results
        .slice(0, 20)
        .map(item => ({
            ...item.series,
            listStatus: item.list?.slug || '',
            listName: item.list?.name || '',
            addedAt: item.updatedAt 
        }));

    // Build dynamic lists based on user's custom lists
    const listsData: any = { added: await enrichWithViewStats(addedRaw).then(enrichWithLatestChapter) };

    // Group items by list
    for (const list of userLists) {
        const listItems = results
            .filter(item => item.listId === list.id)
            .map(item => ({
                ...item.series,
                listStatus: list.slug,
                listName: list.name,
                addedAt: item.updatedAt 
            }));

        listsData[list.slug] = await enrichWithViewStats(listItems).then(enrichWithLatestChapter);
    }

    return res.json({ 
        lists: userLists,
        ...listsData 
    });
}

export async function getPages(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { id, chapterId } = req.params;

    try {
        // 1. Fetch current chapter and verify it belongs to the manga ID
        const [chapter] = await db.select()
            .from(chapters)
            .where(
                and(
                    eq(chapters.id, Number(chapterId)),
                    eq(chapters.seriesId, Number(id))
                )
            );

        if (!chapter) return res.status(404).json({ error: "Chapter not found" });

        // 2. Fetch all chapters for this series to populate the sidebar
        // We cast chapterNumber to DECIMAL to handle 0.1, 1, 1.1 correctly
        const allChapters = await db.select()
            .from(chapters)
            .where(eq(chapters.seriesId, Number(id)))
            .orderBy(
                // Sort by the number before the decimal
                sql`CAST(split_part(${chapters.chapterNumber}, '.', 1) AS INTEGER) ASC`,
                // Sort by the number after the decimal (treating it as an integer, so 1 < 10)
                sql`CASE 
                    WHEN ${chapters.chapterNumber} LIKE '%.%' 
                    THEN CAST(split_part(${chapters.chapterNumber}, '.', 2) AS INTEGER) 
                    ELSE 0 
                END ASC`
            );

        // 3. Construct image URLs from storagePrefix
        // Images are served by Nginx at /media/manga/{storagePrefix}/{pageNumber}.jpg
        const baseUrl = process.env.MEDIA_BASE_URL || `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}/media/manga`;
        
        // Generate image URLs based on pageCount
        const pageCount = chapter.pageCount || 0;
        const images: string[] = [];
        const formatPageNumber = (page: number, scraperId?: string | null) => {
            const padLength = scraperId === 'mangataro' || scraperId === 'toonily' ? 3 : 2;
            return page.toString().padStart(padLength, '0');
        };
        
        for (let i = 1; i <= pageCount; i++) {
            const pageNumber = formatPageNumber(i, chapter.scraperId);
            const imageUrl = `${baseUrl}/${chapter.storagePrefix}/${pageNumber}.webp`;
            images.push(imageUrl);
        }

        const isSinglePageSeries = allChapters.length > 0
            && allChapters.every((ch) => (ch.pageCount || 0) === 1);

        const mergedPages = isSinglePageSeries
            ? allChapters.map((ch) => {
                const pageNumber = formatPageNumber(1, ch.scraperId);
                const imageUrl = `${baseUrl}/${ch.storagePrefix}/${pageNumber}.webp`;
                return {
                    chapterId: ch.id,
                    chapterNumber: ch.chapterNumber,
                    src: imageUrl,
                };
            })
            : null;

        // 4. Return complete payload
        return res.json({
            ...chapter,
            images,
            pageCount: chapter.pageCount || images.length,
            allChapters,
            isSinglePageSeries,
            mergedPages,
        });

    } catch (err) {
        console.error("Internal Server Error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}


// Trigger on-demand chapter scan for a manga
export async function triggerMangaScan(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ error: 'Manga ID is required' });
        }
        
        const mangaId = parseInt(id as string);
        if (isNaN(mangaId)) {
            return res.status(400).json({ error: 'Invalid manga ID' });
        }
        
        // Get manga title from database
        const [manga] = await db.select({ title: series.title }).from(series).where(eq(series.id, mangaId));
        if (!manga) {
            return res.status(404).json({ error: 'Manga not found' });
        }
        
        // Check if manga is already being scanned or downloaded via manga_import_progress
        const progress = await mangaProgressService.getProgress(mangaId);
        
        if (progress && (progress.status === 'scanning' || progress.status === 'downloading')) {
            logger.info(`Manga ${manga.title} (${mangaId}) is already ${progress.status}, skipping duplicate scan`, { service: 'mangaController' });
            return res.status(200).json({ 
                message: 'Scan already in progress', 
                seriesId: mangaId,
                status: progress.status 
            });
        }
        
        // Trigger the on-demand scan
        await mangaOrchestratorService.enqueueOnDemand(mangaId, manga.title || 'Unknown');
        
        return res.status(200).json({ message: 'Scan queued', seriesId: mangaId });
    } catch (error) {
        logger.error(`Failed to trigger manga scan: ${(error as Error).message}`, { service: 'mangaController' });
        return res.status(500).json({ error: 'Failed to trigger scan' });
    }
}

// Client-side view tracking endpoints
export async function trackMangaViewEndpoint(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const id = parseInt(req.params.id, 10);
    const trackingData = (req as any).trackingData;

    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ status: 400, message: "Invalid manga ID" });
    }

    if (trackingData) {
        try {
            await metricsService.trackMangaView(id, trackingData);
        } catch (err) {
            logger.error(`Failed to track manga view: ${err}`, { service: 'mangaController' });
        }
    }

    return res.status(200).json({ success: true });
}

export async function trackChapterViewEndpoint(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { id, chapterId } = req.params;
    const trackingData = (req as any).trackingData;
    const numericId = Number(id);
    const numericChapterId = Number(chapterId);

    if (isNaN(numericId) || numericId <= 0 || isNaN(numericChapterId) || numericChapterId <= 0) {
        return res.status(400).json({ status: 400, message: "Invalid manga or chapter ID" });
    }

    if (trackingData) {
        try {
            await metricsService.trackChapterView(numericChapterId, numericId, trackingData);
        } catch (err) {
            logger.error(`Failed to track chapter view: ${err}`, { service: 'mangaController' });
        }
    }

    return res.status(200).json({ success: true });
}

// Genre weight mapping: more specific/unique genres get higher weights
// Keys are lowercase to make matching case-insensitive
const GENRE_WEIGHTS: Record<string, number> = {
    // Very High (5.0) - Very specific/unique/artistic genres
    'psychological': 5.0,
    'tragedy': 5.0,
    'award winning': 5.0,
    'avant garde': 5.0,
    'gourmet': 5.0,
    'gender bender': 5.0,
    
    // High (4.0-4.5) - Specific genres with strong themes
    'horror': 4.5,
    'mystery': 4.0,
    'thriller': 4.0,
    'suspense': 4.0,
    'historical': 4.0,
    'mecha': 4.0,
    'music': 4.0,
    'mahou shoujo': 4.0,
    
    // Medium-High (3.5) - Somewhat specific genres
    'sci-fi': 3.5,
    'sci fi': 3.5,
    'supernatural': 3.5,
    'sports': 3.5,
    'martial arts': 3.5,
    'boys love': 3.5,
    'girls love': 3.5,
    'yaoi': 3.5,
    'yuri': 3.5,
    'shoujo ai': 3.5,
    'shounen ai': 3.5,
    'lolicon': 3.5,
    'shotacon': 3.5,
    
    // Medium (2.5-3.0) - Common but meaningful genres
    'romance': 2.5,
    'comedy': 2.5,
    'drama': 2.5,
    'fantasy': 2.5,
    'harem': 2.5,
    'erotica': 2.5,
    'hentai': 2.5,
    'smut': 2.5,
    'slice of life': 3.0,
    'school life': 3.0,
    
    // Low (1.5-2.0) - Very generic/common demographics
    'action': 1.5,
    'adventure': 1.5,
    'shounen': 1.5,
    'shoujo': 2.0,
    'seinen': 2.0,
    'josei': 2.0,
    'adult': 2.0,
    'mature': 2.0,
    'ecchi': 2.0,
    'doujinshi': 2.0,
};

const DEFAULT_GENRE_WEIGHT = 2.0;

// Get recommended manga based on genres
export async function getRecommendedManga(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ status: 400, message: "Invalid manga ID" });
        }

        // Get current manga's genres
        const currentManga = await db
            .select({ genres: schema.series.genres })
            .from(schema.series)
            .where(eq(schema.series.id, id))
            .limit(1);

        if (!currentManga.length || !currentManga[0].genres) {
            return res.json([]);
        }

        const genres = currentManga[0].genres as string[];
        const currentGenres = genres.map(g => g?.toLowerCase().trim()).filter(Boolean);
        
        if (currentGenres.length === 0) {
            return res.json([]);
        }

        const primaryGenre = currentGenres[0];
        const genreSet = new Set(currentGenres);

        // Simple, fast query: get high-quality manga with matching genres
        const recommendations = await db
            .select({
                id: schema.series.id,
                title: schema.series.title,
                cover: schema.series.cover,
                genres: schema.series.genres,
                weightedScore: schema.series.weightedScore,
                status: schema.series.status,
                type: schema.series.type,
                contentRating: schema.series.contentRating,
            })
            .from(schema.series)
            .where(
                and(
                    ne(schema.series.id, id),
                    isNotNull(schema.series.genres),
                    gt(schema.series.weightedScore, 0)
                )
            )
            .orderBy(desc(schema.series.weightedScore))
            .limit(limit * 6);

        if (!recommendations.length) {
            return res.json([]);
        }

        // Score and filter in JS
        const scored = recommendations
            .map(manga => ({
                ...manga,
                matchCount: (manga.genres as string[])
                    .filter(g => genreSet.has(g.toLowerCase().trim()))
                    .length
            }))
            .filter(m => m.matchCount > 0)
            .filter(m => !shouldFilterManga(m.genres as any)) // Filter out blocked content
            .sort((a, b) => {
                if (b.matchCount !== a.matchCount) {
                    return b.matchCount - a.matchCount; // More matching genres first
                }
                return (b.weightedScore || 0) - (a.weightedScore || 0); // Then by score
            })
            .slice(0, limit)
            .map(({ matchCount, ...rest }) => rest);

        // If no genre matches, just return top results
        return res.json(scored.length > 0 ? scored : recommendations.filter(m => !shouldFilterManga(m.genres as any)).slice(0, limit));
    } catch (error) {
        logger.error(`Failed to get recommendations: ${(error as Error).message}`, { service: 'mangaController' });
        return next(error);
    }
}

// The testing suite
export async function fetchChaptersWeebCentral(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    mangaOrchestratorService.enqueueTrendingChapterScans(100)
}

// Lightweight gallery fetch with Redis caching.
export async function getGallery(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { id } = req.params;
    const mangaId = Number(id);

    if (!Number.isFinite(mangaId) || mangaId <= 0) {
        return res.status(400).json({ status: 400, message: "Invalid manga ID" });
    }

    const cacheKey = `gallery:mangabaka:${mangaId}`;
    const cacheTtlSeconds = 5 * 24 * 60 * 60; // 5 days
    const requestUrl = `https://api.mangabaka.dev/v1/series/${mangaId}/images?language=en&language=ja`;

    try {
        const gallery = await cacheService.getOrSet(
            {
                key: cacheKey,
                ttl: cacheTtlSeconds,
                staleIfError: cacheTtlSeconds,
            },
            async () => {
                const response = await axios.get(requestUrl, { timeout: 15000 });

                if (!response || response.status !== 200) {
                    throw new Error('Error fetching gallery');
                }

                const data = response.data?.data;
                if (!Array.isArray(data) || data.length === 0) {
                    return [];
                }

                return data.filter((item: any) => item?.type === 'volume');
            }
        );

        return res.json(gallery);
    } catch (error) {
        logger.error(`Error fetching gallery: ${(error as Error).message}`, { service: 'mangaController' });
        return res.status(200).json({ gallery: [] }); // Return empty gallery on error to avoid breaking the client
    }
}

export async function getCollections(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const collections = await getCollectionsList();
        
        return res.json(collections);
    } catch (error) {
        logger.error(`Error fetching collections: ${(error as Error).message}`, { service: 'mangaController' });
        return res.status(500).json({ error: "Failed to fetch collections" });
    }
}

export async function randomManga(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
        
    const excludedGenres = ['Hentai', 'Ecchi', 'Adult', 'Mature', 'Lolicon', 'Shotacon'];

        try {
            const randomManga = await db.select({
                id: schema.series.id,
                title: schema.series.title,
                cover: schema.series.cover,
            })
            .from(schema.series)
            .where(
                and(
                    isNotNull(schema.series.cover),
                    isNotNull(schema.series.genres),
                    isNotNull(schema.series.weightedScore),
                    gt(schema.series.weightedScore, 50),
                    ...excludedGenres.map(genre => 
                        sql`not (${schema.series.genres} @> ${JSON.stringify([genre])}::jsonb)`
                    )
                )
            )
            .orderBy(sql`random()`)
            .limit(4);


        if (!randomManga || randomManga.length === 0) return res.status(404).json({ error: "No manga found" });
        
        return res.json(randomManga);
    } catch (error) {
        logger.error(`Random Manga Error: ${(error as Error).message}`, { service: 'mangaController' });
        return res.status(500).json({ error: "Failed to fetch random manga" });
    }
}