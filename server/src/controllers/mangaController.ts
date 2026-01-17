import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, inArray, isNull, ilike, ne, getTableColumns, isNotNull, gt } from 'drizzle-orm';
import { chapters, series } from '@/db/schema';
import { auth } from "@/utils/auth";
import { mangaImporterService } from '@/services/mangaImporterService';
import { queueService } from '@/services/queueService';
import path from 'path/win32';
import fs from 'fs-extra';

export async function searchManga(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const { genres, type, status, search, nsfw, sort = "weightedScore", order = "desc", cursor, limit = "40" } = req.query;

        const pageSize = Math.min(Number(limit), 40);
        
        // 1. Determine Sort Order
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

        if (nsfw === 'false') { conditions.push(and(ne(schema.series.contentRating, 'erotica'), ne(schema.series.contentRating, 'pornographic')));}

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
        
        let nextCursor = null;
        if (hasNextPage) {
            const lastItem = items[items.length - 1];
            const val = lastItem[sortKey as keyof typeof lastItem] ?? 0;
            nextCursor = `${val}|${lastItem.id}`;
        }

        return res.json({
            meta: {
                total: Number(totalCountResult?.count || 0),
                count: items.length,
                limit: pageSize,
                hasMore: hasNextPage,
                sort,
                order: isAsc ? 'asc' : 'desc'
            },
            items,
            nextCursor
        });
    } catch (error) {
        return next(error);
    }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const id = parseInt(req.params.id, 10);

    const headers = new Headers();
        Object.entries(req.headers).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach(v => headers.append(key, v));
            } else if (value) {
                headers.append(key, value);
            }
        });
    const session = await auth.api.getSession({headers: headers});
    const userId = (session?.user.id)!;

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

    
    return res.json({
        status: 200,
        manga,
        userStatus
    })
}

export async function updateMangaList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const { seriesId, status } = req.body as { 
        seriesId: number; 
        status: 'unread' | 'reading' | 'finished' | 'dropped'; 
    };

    // Authentication
    const headers = new Headers();
    Object.entries(req.headers).forEach(([k, v]) => { if(v) headers.append(k, Array.isArray(v) ? v[0] : v) });
    const session = await auth.api.getSession({headers: headers});
    const userId = (session?.user.id)!;

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
        const headers = new Headers();
        Object.entries(req.headers).forEach(([k, v]) => { if(v) headers.append(k, Array.isArray(v) ? v[0] : v) });
        const session = await auth.api.getSession({headers: headers});
        const userId = (session?.user.id)!;

        await db.delete(schema.userSeriesList).where(and(eq(schema.userSeriesList.userId, userId), eq(schema.userSeriesList.seriesId, req.body.seriesId)));
        return res.status(200).json({ success: true });
    } catch (e) { 
        return res.status(500).json({ success: false }); 
    }
}

export async function getUserLists(req: Request, res: Response) {
    const { status }: any = req.query;

    const headers = new Headers();
    Object.entries(req.headers).forEach(([k, v]) => { if(v) headers.append(k, Array.isArray(v) ? v[0] : v) });
    const session = await auth.api.getSession({headers: headers});
    const userId = (session?.user.id)!;

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
        // Replace with your actual domain/port if different
        const baseUrl = "http://localhost:3000/api/manga-files";
        const baseSystemPath = "/home/whogi/projects/mang/server";

        const images = files
            .filter(file => /\.(jpe?g|png|webp|gif)$/i.test(file))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .map(file => {
                // Remove the base system path to get the relative folder structure
                const relativePath = directoryPath.replace(baseSystemPath, "");
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


export async function fetchChaptersWeebCentral(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const mangaTitle = "Sousou no Frieren"; 
    const seriesId = 1995;

    await queueService.addJob('mangaChapterImportQueue', `Sync ${mangaTitle}`, {
        mangaTitle,
        seriesId
    });

    return res.status(202).json({ success: true, message: "Scrape queued." });
}