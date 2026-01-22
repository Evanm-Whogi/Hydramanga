import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, inArray, isNull, ilike, ne, getTableColumns, isNotNull, gt } from 'drizzle-orm';
import { chapters, series } from '@/db/schema';
import path from 'path';
import fs from 'fs-extra';
import logger from '@/services/loggerService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import { metricsService } from '@/services/metricsService';

// Part of testing 
import { auth } from "@/utils/auth";
import { mangaImporterService } from '@/services/mangaImporterService';
import { queueService } from '@/services/queueService';


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
            const pattern = `%${search}%`;
            conditions.push(or(ilike(schema.series.title, pattern), ilike(schema.series.romanizedTitle, pattern), ilike(schema.series.nativeTitle, pattern)));
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

        // Statically exlude Hentai while in Alpha 
        conditions.push(sql`NOT (${schema.series.genres} @> '["Hentai"]'::jsonb)`);

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
        
        const enrichedItems = items.map(manga => {
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
    const userId = req.user.id;

    // Validate ID before any operations
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ status: 400, message: "Invalid manga ID" });
    }

    const mangaData = await db.query.series.findFirst({
        where: (series, { eq }) => eq(series.id, id),
        with: {
        chapters: {
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
        usersTracking: userId 
            ? { where: (ut, { eq }) => eq(ut.userId, userId) } 
            : undefined,
        },
    });
    if(!mangaData) return res.json({status: 404, message: "Not found"});

    const userStatus = mangaData.usersTracking?.[0]?.status || null;
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

export async function updateMangaList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { seriesId, status } = req.body as { 
        seriesId: number; 
        status: 'unread' | 'reading' | 'finished' | 'dropped'; 
    };
    const userId = req.user.id;

    const result = await db.insert(schema.userSeriesList)
        .values({
            userId,
            seriesId,
            status: status,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [schema.userSeriesList.userId, schema.userSeriesList.seriesId],
            set: { 
                status: status, 
                updatedAt: new Date() 
            },
        })
        .returning();

    return res.status(200).json({
        success: true,
        message: `Manga moved to ${status}`,
        data: result[0]
    });
}

export async function removeFromList(req: Request, res: Response) {
    try {
        const userId = req.user.id;

        await db.delete(schema.userSeriesList).where(and(eq(schema.userSeriesList.userId, userId), eq(schema.userSeriesList.seriesId, req.body.seriesId)));
        return res.status(200).json({ success: true });
    } catch (e) { 
        return res.status(500).json({ success: false }); 
    }
}

export async function getUserLists(req: Request, res: Response) {
    const { status }: any = req.query;
    const userId = req.user.id;

    if (!status) return res.status(400).json({ error: "Status is required" });

    const results = await db.query.userSeriesList.findMany({
        where: and(
            eq(schema.userSeriesList.userId, userId),
            eq(schema.userSeriesList.status, status.toLowerCase())
        ),
        with: {
            series: true,
        },
    });

    const formattedData = results.map(item => ({
        ...item.series,
        listStatus: item.status,
        addedAt: item.updatedAt 
    }));

    return res.json(formattedData);
}

export async function getAllLists(req: Request, res: Response) {
    const userId = req.user.id;

    const results = await db.query.userSeriesList.findMany({
        where: eq(schema.userSeriesList.userId, userId),
        with: {
            series: true,
        },
        orderBy: (userSeriesList, { desc }) => [desc(userSeriesList.updatedAt)],
    });

    var addedRaw = results
        .sort((a, b) => b.updatedAt!.getTime() - a.updatedAt!.getTime())
        .slice(0, 20)
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const unreadRaw = results
        .filter(item => item.status === 'unread')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const readingRaw = results
        .filter(item => item.status === 'reading')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const finishedRaw = results
        .filter(item => item.status === 'finished')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const droppedRaw = results
        .filter(item => item.status === 'dropped')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));


    let [added, unread, reading, finished, dropped] = await Promise.all([
        enrichWithViewStats(addedRaw),
        enrichWithViewStats(unreadRaw),
        enrichWithViewStats(readingRaw),
        enrichWithViewStats(finishedRaw),
        enrichWithViewStats(droppedRaw),
    ]);


    return res.json({ added, unread, reading, finished, dropped });
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

        // 3. Resolve the physical directory path
        // Using path.isAbsolute to handle /home/whogi... correctly
        const directoryPath = path.isAbsolute(chapter.localPath) 
            ? chapter.localPath 
            : path.join(process.cwd(), 'public', chapter.localPath);

        // 4. Read images from the filesystem
        if (!fs.existsSync(directoryPath)) {
            console.error("Directory not found:", directoryPath);
            return res.status(404).json({ error: "Image directory not found on disk" });
        }

        const files = fs.readdirSync(directoryPath);
        
        // Define the base URL where your Express server serves static files
        const publicApp = process.env.PUBLIC_APP_URL || "http://localhost:3000";
        const baseUrl = process.env.CHAPTER_PUBLIC_BASE || `${publicApp}/api/manga-files`;
        const baseSystemPath = process.env.CHAPTER_STORAGE_ROOT || path.join(process.cwd(), 'chapters');

        const images = files
            .filter(file => /\.(jpe?g|png|webp|gif)$/i.test(file))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .map(file => {
                // Remove the base system path to get the relative folder structure
                const legacyBase = process.cwd();
                const relativePath = directoryPath.startsWith(baseSystemPath)
                    ? directoryPath.replace(baseSystemPath, "")
                    : directoryPath.replace(legacyBase, "");

                // Clean up slashes and encode for URL safety
                const cleanPath = path.join(relativePath, file).replace(/\\/g, "/");
                return `${baseUrl}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
            });

        // 5. Return complete payload
        return res.json({
            ...chapter,
            images,
            pageCount: chapter.pageCount || images.length, // Use DB pageCount or fallback to actual count
            allChapters
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

        // Get the current manga's genres
        const currentManga = await db.query.series.findFirst({
            where: (series, { eq }) => eq(series.id, id),
            columns: {
                id: true,
                genres: true,
                type: true,
                contentRating: true,
            }
        });

        if (!currentManga || !currentManga.genres) {
            return res.json([]);
        }

        const currentGenres = (currentManga.genres as string[]).map(g => g?.toLowerCase().trim()).filter(Boolean);
        
        // Build CASE statement for weighted genre matching (case-insensitive)
        // Use raw SQL here because values originate from our DB and are sanitized to lowercase/trimmed
        const genreCases = currentGenres.map(genre => {
            const weight = GENRE_WEIGHTS[genre] || DEFAULT_GENRE_WEIGHT;
            const escapedGenre = genre.replace(/'/g, "''");
            return `WHEN lower(genre) = '${escapedGenre}' THEN ${weight}`;
        }).join(' ');
        
        // Build a query to find manga with weighted matching genres
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
                // Calculate weighted match score using SQL
                matchScore: sql<number>`(
                    SELECT COALESCE(SUM(
                        CASE ${sql.raw(genreCases)}
                        ELSE 0
                        END
                    ), 0)::float
                    FROM jsonb_array_elements_text(${schema.series.genres}) AS genre
                )`.as('match_score')
            })
            .from(schema.series)
            .where(
                and(
                    ne(schema.series.id, id), // Exclude current manga
                    sql`${schema.series.genres} IS NOT NULL`,
                    sql`jsonb_array_length(${schema.series.genres}) > 0`,
                    // Optional: match same type (manga/manhwa/etc)
                    currentManga.type ? eq(schema.series.type, currentManga.type) : undefined
                )
            )
            .orderBy(
                desc(sql`match_score`),
                desc(schema.series.weightedScore)
            )
            .limit(limit * 2); // Get more to filter

        // Filter and deduplicate
        const seenIds = new Set<number>();
        const seenTitles = new Set<string>();
        const filtered = recommendations
            .filter(manga => {
                const matchScore = manga.matchScore as number;
                // Must have at least one matching genre
                if (matchScore <= 0) return false;
                
                // Deduplicate by ID
                if (seenIds.has(manga.id)) return false;
                seenIds.add(manga.id);
                
                // Deduplicate by title (in case there are duplicate entries with different IDs)
                const normalizedTitle = manga.title?.toLowerCase().trim();
                if (normalizedTitle && seenTitles.has(normalizedTitle)) return false;
                if (normalizedTitle) seenTitles.add(normalizedTitle);
                
                return true;
            })
            .slice(0, limit);

        // Enrich with view stats
        const enriched = await enrichWithViewStats(filtered);

        return res.json(enriched);
    } catch (error) {
        logger.error(`Failed to get recommendations: ${(error as Error).message}`, { service: 'mangaController' });
        return next(error);
    }
}

// The testing suite
export async function fetchChaptersWeebCentral(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    mangaOrchestratorService.enqueueTrendingChapterScans(100)
}