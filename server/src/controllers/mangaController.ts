import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, inArray, isNull, ilike, ne, getTableColumns, isNotNull, gt } from 'drizzle-orm';
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
        const { genres, type, status, search, years, nsfw, sort = "weightedScore", order = "desc", cursor, limit = "40" } = req.query;
        const pageSize = Math.min(Number(limit), 40);
        const isAsc = String(order).toLowerCase() === 'asc';
        const conditions = [];

        const parseParam = (param: any) => {
            if (!param) return [];
            return (Array.isArray(param) ? param : String(param).split(',')).map(v => v.trim()).filter(Boolean);
        };

        // Filters logic
        if (search) {
            const trimmedSearch = String(search).trim();
            // Only add search condition if the trimmed search is not empty
            if (trimmedSearch) {
                const pattern = `%${trimmedSearch}%`;
                conditions.push(or(ilike(schema.series.title, pattern), ilike(schema.series.romanizedTitle, pattern), ilike(schema.series.nativeTitle, pattern)));
            }
        }

        const genreList = parseParam(genres);
        if (genreList.length > 0) {
            for (const g of genreList) {
                conditions.push(sql`${schema.series.genres} @> ${JSON.stringify([g])}::jsonb`);
            }
        }

        const typeList = parseParam(type).map(t => t.toLowerCase());
        if (typeList.length > 0) { conditions.push(inArray(schema.series.type, typeList)); }

        const statusList = parseParam(status);
        if (statusList.length > 0) { conditions.push(inArray(schema.series.status, statusList)); }

        // Handle year filtering
        const yearList = parseParam(years);
        if (yearList.length > 0) {
            const yearConditions: any[] = [];
            for (const year of yearList) {
                if (year === 'timeless') {
                    // Timeless means no year specified (year is null)
                    yearConditions.push(isNull(schema.series.year));
                } else if (year.endsWith('s')) {
                    // Decade filter (e.g., "1950s", "2020s")
                    const decadeStart = parseInt(year);
                    const decadeEnd = decadeStart + 9;
                    yearConditions.push(
                        and(
                            isNotNull(schema.series.year),
                            sql`${schema.series.year} >= ${decadeStart}`,
                            sql`${schema.series.year} <= ${decadeEnd}`
                        )
                    );
                } else {
                    // Specific year filter (e.g., "2024", "2025")
                    const targetYear = parseInt(year);
                    yearConditions.push(
                        and(
                            isNotNull(schema.series.year),
                            sql`${schema.series.year} = ${targetYear}`
                        )
                    );
                }
            }
            // Use OR logic - match any of the year conditions
            if (yearConditions.length > 0) {
                conditions.push(or(...yearConditions));
            }
        }

        // Hide NSFW content unless explicitly allowed
        if (nsfw === 'false') { conditions.push(and(ne(schema.series.contentRating, 'erotica'), ne(schema.series.contentRating, 'pornographic')));}

        // Filter blocked adult/porn genres
        const blockedGenres = getBlockedGenres();
        for (const blockedGenre of blockedGenres) {
            conditions.push(sql`NOT (${schema.series.genres} @> ${JSON.stringify([blockedGenre])}::jsonb)`);
        }

        // Exclude merged series
        conditions.push(or(ne(schema.series.state, 'merged'), isNull(schema.series.state)));

        // 2. Dynamic Sorting Logic
        const columns = getTableColumns(schema.series);
        const sortKey = (sort as keyof typeof columns) || 'weightedScore';
        
        // Handle Numeric Casting and special column logic
        const effectiveSort = sortKey === 'totalChapters' 
            ? sql`NULLIF(${schema.series.totalChapters}, '')::int` 
            : columns[sortKey];

        if (sortKey === 'totalChapters') {
            conditions.push(and(isNotNull(schema.series.totalChapters), ne(schema.series.totalChapters, '0'), ne(schema.series.totalChapters, '')));
        }

        // 3. Keyset Pagination (Cursor)
        if (cursor) {
            const [cursorVal, cursorId] = String(cursor).split('|');
            // Use > for ASC and < for DESC
            const operator = isAsc ? sql`>` : sql`<`;
            const cursorValTyped = (sortKey === 'totalChapters' || typeof columns[sortKey] === 'number') 
                ? Number(cursorVal) 
                : cursorVal;
            
            conditions.push(sql`(${effectiveSort}, ${schema.series.id}) ${operator} (${cursorValTyped}, ${Number(cursorId)})`);
        }

        // 4. Execution
        const [totalCountResult] = await db.select({ count: count() }).from(schema.series).where(and(...conditions));

        const data = await db.select().from(schema.series)
            .where(and(...conditions))
            .orderBy(
                isAsc ? asc(effectiveSort) : desc(effectiveSort), 
                isAsc ? asc(schema.series.id) : desc(schema.series.id)
            )
            .limit(pageSize + 1);

        // 5. Cursor Formatting
        const hasNextPage = data.length > pageSize;
        const items = hasNextPage ? data.slice(0, -1) : data;
        
        // Enrich with view stats
        const seriesIds = items.map(m => m.id);
        const viewStats = seriesIds.length > 0 ? await db
            .select()
            .from(schema.mangaViewStats)
            .where(inArray(schema.mangaViewStats.seriesId, seriesIds)) : [];
        
        let enrichedItems = items.map(manga => {
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
        
        // Attach user's series list info (if available) to each manga
        const userId = (req as any).user?.id;
        if (userId && seriesIds.length > 0) {
            const userSeriesEntries = await db.query.userSeriesList.findMany({
                where: and(
                    eq(schema.userSeriesList.userId, userId),
                    inArray(schema.userSeriesList.seriesId, seriesIds)
                ),
                with: {
                    list: {
                        columns: {
                            id: true,
                            name: true,
                            slug: true,
                        }
                    }
                }
            });

            const userSeriesMap = new Map<number, any>();
            userSeriesEntries.forEach((e: any) => userSeriesMap.set(e.seriesId, {
                id: e.id,
                seriesId: e.seriesId,
                listId: e.listId,
                addedAt: e.updatedAt,
                listName: e.list?.name || null,
            }));

            enrichedItems = enrichedItems.map(item => ({
                ...item,
                userSeriesList: userSeriesMap.get(item.id) || null,
            }));
        }

        // Fetch latest chapter per series and attach it
        if (seriesIds.length > 0) {
            const latestRows = await db.select()
                .from(chapters)
                .where(inArray(chapters.seriesId, seriesIds))
                .orderBy(
                    asc(chapters.seriesId),
                    // Order by integer part of chapterNumber (major) desc
                    desc(sql`CAST(split_part(${chapters.chapterNumber}, '.', 1) AS INTEGER)`),
                    // Order by fractional part (minor) desc, treat missing as 0
                    desc(sql`CASE WHEN ${chapters.chapterNumber} LIKE '%.%' THEN CAST(split_part(${chapters.chapterNumber}, '.', 2) AS INTEGER) ELSE 0 END`)
                );

            const latestMap = new Map<number, any>();
            for (const ch of latestRows) {
                if (!latestMap.has(ch.seriesId)) latestMap.set(ch.seriesId, ch);
            }

            enrichedItems = enrichedItems.map(item => ({
                ...item,
                latestChapter: latestMap.get(item.id) || null,
            }));
        }

        let nextCursor = null;
        if (hasNextPage) {
            const lastItem = items[items.length - 1];
            const val = lastItem[sortKey as keyof typeof lastItem] ?? 0;
            nextCursor = `${val}|${lastItem.id}`;
        }

        return res.json({
            meta: {
                total: Number(totalCountResult?.count || 0),
                count: enrichedItems.length,
                limit: pageSize,
                hasMore: hasNextPage,
                sort,
                order: isAsc ? 'asc' : 'desc'
            },
            items: enrichedItems,
            nextCursor
        });
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
                likes: true,
                replies: {
                    with: {
                        author: {
                            columns: {
                                id: true,
                                name: true,
                                image: true,
                            },
                        },
                        likes: true,
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
            const padLength = scraperId === 'mangataro' ? 3 : 2;
            return page.toString().padStart(padLength, '0');
        };
        
        for (let i = 1; i <= pageCount; i++) {
            const pageNumber = formatPageNumber(i, chapter.scraperId);
            const imageUrl = `${baseUrl}/${chapter.storagePrefix}/${pageNumber}.jpg`;
            images.push(imageUrl);
        }

        const isSinglePageSeries = allChapters.length > 0
            && allChapters.every((ch) => (ch.pageCount || 0) === 1);

        const mergedPages = isSinglePageSeries
            ? allChapters.map((ch) => {
                const pageNumber = formatPageNumber(1, ch.scraperId);
                const imageUrl = `${baseUrl}/${ch.storagePrefix}/${pageNumber}.jpg`;
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
        return res.status(500).json({ error: "Error fetching gallery" });
    }
}

export async function getCollections(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    // 1. Define genres with their respective descriptions
    const genreMetadata = [
        { name: "Romance", description: "Discover heartwarming love stories, emotional relationships, and the complexities of romantic connections in these captivating series." },
        { name: "Comedy", description: "Dive into lighthearted stories filled with witty humor, hilarious misunderstandings, and entertaining scenarios that range from clever satire to slapstick comedy" },
        { name: "Fantasy", description: "Journey through realms of magic, where epic quests and supernatural powers collide in spellbinding fantasy tales." },
        { name: "Drama", description: "Real emotions, complicated relationships, and life-changing moments. These compelling stories hold up a mirror to life itself, making you feel every high and low" },
        { name: "School Life", description: "From first-day jitters to graduation tears, these stories capture all the drama, friendship, and unforgettable moments that make school life special. Class is in session!" },
        { name: "Shounen", description: "Experience thrilling adventures filled with intense battles, unwavering friendships, and heroic journeys where determined protagonists overcome increasingly powerful" },
        { name: "Shoujo", description: "Experience heartfelt stories centered around young heroines navigating love, friendship, and personal growth, with distinctive art styles featuring expressive character" },
        { name: "Seinen", description: "Sophisticated narratives and complex themes in manga series crafted for mature readers, featuring realistic storytelling." },
        { name: "Supernatural", description: "Venture into a world where the ordinary meets the extraordinary, featuring spirits, curses, and otherworldly phenomena. These stories blur the lines between reality" },
        { name: "Boys Love", description: "Explore heartwarming and passionate stories of romance between men, featuring emotional storytelling, character growth, and the beautiful complexities of male relationships." },
        { name: "Slice of Life", description: "Immerse yourself in gentle stories that celebrate the beauty of everyday moments, where simple daily experiences and quiet personal growth create meaningful connections." },
        { name: "Ecchi", description: "Playful and suggestive comedies featuring romantic mishaps, awkward situations, and light fanservice, blending humor with romance in entertaining and cheeky" },
        { name: "Mystery", description: "Unravel thrilling mysteries filled with suspense, unexpected twists, and complex characters. These stories will keep you guessing until the very end." },
         { name: "Horror", description: "Brace yourself for chilling tales that delve into the darkest corners of fear, featuring supernatural entities, psychological terror, and spine-tingling suspense." },
         { name: "Action", description: "Experience high-octane excitement with intense battles, daring feats, and relentless energy. These stories are packed with adrenaline-pumping action from start to finish." },
         { name: "Adventure", description: "Embark on epic journeys filled with exploration, danger, and discovery. These stories take you to uncharted territories where heroes face thrilling challenges." },
         { name: "Psychological", description: "Delve into the complexities of the human mind with stories that explore psychological tension, moral dilemmas, and the intricate workings of characters' psyches." },
         { name: "Tragedy", description: "Experience powerful narratives that explore themes of loss, sacrifice, and the human condition. These stories evoke deep emotions and often leave a lasting impact on readers." },
         { name: "Award Winning", description: "Discover critically acclaimed manga series that have received prestigious awards for their exceptional storytelling, art, and impact on the medium." },
         { name: "Avant Garde", description: "Explore experimental and unconventional manga that pushes the boundaries of storytelling and art, offering unique and thought-provoking experiences." },
         { name: "Gourmet", description: "Savor delicious stories centered around food, cooking, and culinary adventures. These manga will whet your appetite with mouthwatering dishes and heartfelt narratives." },
         { name: "Gender Bender", description: "Experience stories that challenge traditional gender roles, featuring characters who crossdress, switch genders, or explore fluid identities, often with humor and heart." },
        { name: "Harem", description: "Dive into romantic comedies where a single protagonist finds themselves surrounded by multiple love interests, leading to humorous and heartfelt situations." },
        { name: "Historical", description: "Travel back in time with stories set in various historical periods, blending real events and figures with compelling narratives and rich world-building." },
        { name: "Josei", description: "Experience mature and realistic stories that explore the lives, relationships, and personal growth of adult women." },
        { name: "Mahou Shoujo", description: "Enter a world of magic and wonder with stories featuring young heroines who transform into magical beings." },
        { name: "Martial Arts", description: "Experience intense battles and disciplined training in stories centered around martial arts, where characters strive for strength and honor." },
        { name: "Mature", description: "Explore complex themes and mature storytelling that delves into the intricacies of human relationships, societal issues, and personal growth." },
        { name: "Mecha", description: "Dive into futuristic worlds where giant robots and advanced technology play a central role in epic battles and intricate plots." },
        { name: "Music", description: "Experience the rhythm of stories centered around music, where characters pursue their passions, form bands, and navigate the highs and lows of the music industry." },
        { name: "Sci-Fi", description: "Venture into speculative futures with stories that explore advanced technology, space exploration, and the impact of science on society." },
        { name: "Shoujo Ai", description: "Discover tender and emotional stories of romance between young women, featuring heartfelt narratives and deep emotional connections." },
        { name: "Shounen Ai", description: "Explore sweet and emotional stories of romance between young men, focusing on character development and heartfelt relationships." },
        { name: "Sports", description: "Get in the game with stories that capture the thrill of competition, teamwork, and personal growth through sports." },
        { name: "Suspense", description: "Experience nail-biting tension and uncertainty in stories that keep you on the edge of your seat with unexpected twists and high stakes." },
        { name: "Thriller", description: "Dive into fast-paced and gripping narratives filled with danger, intrigue, and suspense that will keep you hooked until the last page." },
        { name: "Yaoi", description: "Explore passionate and emotional stories of romance between men, featuring intense relationships and heartfelt storytelling." },
        { name: "Yuri", description: "Discover beautiful and emotional stories of romance between women, featuring deep emotional connections and heartfelt narratives." },
        { name: "Lolicon", description: "Note: This genre contains content that may be inappropriate or offensive to some audiences. It typically features romantic or sexual relationships involving underage characters. Please exercise discretion when exploring this genre." },
        { name: "Shotacon", description: "Note: This genre contains content that may be inappropriate or offensive to some audiences. It typically features romantic or sexual relationships involving underage characters. Please exercise discretion when exploring this genre." },
        { name: "Hentai", description: "Explicit adult content featuring graphic depictions of sexual themes. This genre is intended for mature audiences only and often explores a wide range of fantasies and fetishes." },
        { name: "Smut", description: "Steamy stories that focus on explicit romantic and sexual relationships, often blending passionate storytelling with mature themes." },
        { name: "Doujinshi", description: "Fan-created works that can range from lighthearted parodies to original stories, often exploring popular series or unique concepts with a personal touch." },
        { name: "Adult", description: "Mature content that explores explicit themes, relationships, and narratives intended for adult audiences, often delving into complex and provocative storytelling." },
        { name: "Erotica", description: "Sensual and provocative stories that explore themes of desire, intimacy, and passion, often with explicit content intended for mature audiences." },
        { name: "Girls Love", description: "Discover tender and emotional stories of romance between young women, featuring heartfelt narratives and deep emotional connections." },
    ];

    // Fallback description for any genre not explicitly defined above
    const defaultDescription = "Explore a curated selection of popular titles within this category.";

    const cacheKey = `collections:genres:v2`; // Updated key since data structure changed
    const cacheTtlSeconds = 3 * 24 * 60 * 60; // 3 days

    try {
        const collectionsData = await cacheService.getOrSet(
            {
                key: cacheKey,
                ttl: cacheTtlSeconds,
                staleIfError: cacheTtlSeconds,
            },
            async () => {
                const genreNames = genreMetadata.map(g => g.name);

                const results = await db.execute(sql`
                    WITH expanded_manga AS (
                        SELECT 
                            jsonb_array_elements_text(${schema.series.genres}) as genre,
                            ${schema.series.id} as id,
                            ${schema.series.title} as title,
                            ${schema.series.cover} as cover,
                            ${schema.series.weightedScore} as "weightedScore",
                            CASE WHEN ${schema.series.weightedScore} >= 75 THEN 1 ELSE 2 END as priority
                        FROM ${schema.series}
                        WHERE ${schema.series.genres} IS NOT NULL
                    ),
                    ranked_manga AS (
                        SELECT *,
                            ROW_NUMBER() OVER(
                                PARTITION BY genre 
                                ORDER BY priority ASC, RANDOM() 
                            ) as rank,
                            COUNT(*) OVER(PARTITION BY genre) as total_count
                        FROM expanded_manga
                        WHERE genre = ANY(ARRAY[${sql.join(genreNames.map(g => sql`${g}`), sql`, `)}])
                    )
                    SELECT * FROM ranked_manga WHERE rank <= 3
                `);

                const data: any = {};
                
                // 2. Pre-fill with name and description
                genreMetadata.forEach(g => {
                    data[g.name] = { 
                        description: g.description,
                        count: 0, 
                        topManga: [] 
                    };
                });

                const rows = (results.rows || results) as any[];

                rows.forEach((row) => {
                    const { genre, total_count, id, title, cover, weightedScore } = row;
                    if (data[genre]) {
                        data[genre].count = Number(total_count);
                        data[genre].topManga.push({ id, title, cover, weightedScore });
                    }
                });

                return data;
            }
        );

        return res.json(collectionsData);
    } catch (error) {
        if (typeof logger !== 'undefined') {
            logger.error(`Collection Query Error: ${(error as Error).message}`, { service: 'mangaController' });
        } else {
            console.error("Collection Query Error:", error);
        }
        return res.status(500).json({ error: "Failed to fetch collections" });
    }
}