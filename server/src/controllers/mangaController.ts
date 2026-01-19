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

// Search manga with filters, sorting, and pagination (Infinite Scroll)
export async function searchManga(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const { genres, type, status, search, nsfw, sort = "weightedScore", order = "desc", cursor, limit = "40" } = req.query;
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

    // Track manga view (async, don't await to avoid slowing down response)
    const trackingData = (req as any).trackingData;
    if (trackingData) {
        metricsService.trackMangaView(id, trackingData).catch(err => 
            logger.error(`Failed to track manga view: ${err}`, { service: 'mangaController' })
        );
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

    // Trigger on-demand scrape for any manga with no chapters on first view
    if ((mangaData.chapters?.length || 0) === 0) {
        mangaOrchestratorService.enqueueOnDemand(mangaData.id, mangaData.title || 'Unknown')
        .catch((err) => logger.error(`On-demand enqueue failed: ${err.message}`, { service: 'mangaController' }));
    }

    const userStatus = mangaData.usersTracking?.[0]?.status || null;
    const { usersTracking, ...manga } = mangaData;

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

    const added = results
        .sort((a, b) => b.updatedAt!.getTime() - a.updatedAt!.getTime())
        .slice(0, 20)
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const unread = results
        .filter(item => item.status === 'unread')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const reading = results
        .filter(item => item.status === 'reading')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const finished = results
        .filter(item => item.status === 'finished')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));

    const dropped = results
        .filter(item => item.status === 'dropped')
        .map(item => ({
            ...item.series,
            listStatus: item.status,
            addedAt: item.updatedAt 
        }));


    return res.json({ added, unread, reading, finished, dropped });
}

export async function getPages(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { id, chapterId } = req.params;

    try {
        // Track chapter view (async, don't await to avoid slowing down response)
        // Only track if we have valid numeric IDs
        const trackingData = (req as any).trackingData;
        const numericId = Number(id);
        const numericChapterId = Number(chapterId);
        if (trackingData && !isNaN(numericId) && numericId > 0 && !isNaN(numericChapterId) && numericChapterId > 0) {
            metricsService.trackChapterView(numericChapterId, numericId, trackingData).catch(err =>
                logger.error(`Failed to track chapter view: ${err}`, { service: 'mangaController' })
            );
        }

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
        const baseUrl = process.env.CHAPTER_PUBLIC_BASE || "http://localhost:3000/api/manga-files";
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
            allChapters
        });

    } catch (err) {
        console.error("Internal Server Error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}


// The testing suite
export async function fetchChaptersWeebCentral(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    mangaOrchestratorService.enqueueTrendingChapterScans(100)
}