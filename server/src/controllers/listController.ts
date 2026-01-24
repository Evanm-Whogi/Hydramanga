import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

// Helper function to create default lists for a user
export async function ensureDefaultLists(userId: string) {
    const defaultLists = [
        { name: 'Unread', slug: 'unread', sortOrder: 0, isDefault: true },
        { name: 'Reading', slug: 'reading', sortOrder: 1, isDefault: true },
        { name: 'Finished', slug: 'finished', sortOrder: 2, isDefault: true },
        { name: 'Dropped', slug: 'dropped', sortOrder: 3, isDefault: true },
    ];

    const existingLists = await db.query.userLists.findMany({
        where: eq(schema.userLists.userId, userId),
    });

    // Seed any missing default lists (appended after current sort order)
    const existingBySlug = new Map(existingLists.map(l => [l.slug, l]));
    const missingDefaults = defaultLists.filter(d => !existingBySlug.has(d.slug));

    if (missingDefaults.length > 0) {
        const maxSortOrder = existingLists.reduce((max, l) => Math.max(max, l.sortOrder ?? 0), -1);
        let sort = maxSortOrder + 1;
        for (const list of missingDefaults) {
            await db.insert(schema.userLists).values({
                userId,
                ...list,
                sortOrder: sort++,
            }).onConflictDoNothing({
                target: [schema.userLists.userId, schema.userLists.slug],
            });
        }
    }

    return await db.query.userLists.findMany({
        where: eq(schema.userLists.userId, userId),
        orderBy: (userLists, { asc }) => [asc(userLists.sortOrder)],
    });
}

// Get all lists for the current user
export async function getUserLists(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        
        // Ensure user has default lists
        const lists = await ensureDefaultLists(userId);
        
        return res.json({ 
            success: true, 
            lists 
        });
    } catch (error) {
        return next(error);
    }
}

// Create a new custom list
export async function createList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'List name is required' 
            });
        }

        // Create slug from name
        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        // Check if slug already exists for this user
        const existing = await db.query.userLists.findFirst({
            where: and(
                eq(schema.userLists.userId, userId),
                eq(schema.userLists.slug, slug)
            ),
        });

        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'A list with this name already exists' 
            });
        }

        // Get max sort order
        const [maxOrder] = await db
            .select({ max: sql<number>`MAX(${schema.userLists.sortOrder})` })
            .from(schema.userLists)
            .where(eq(schema.userLists.userId, userId));

        const sortOrder = (maxOrder?.max ?? -1) + 1;

        const [newList] = await db.insert(schema.userLists).values({
            userId,
            name: name.trim(),
            slug,
            isDefault: false,
            sortOrder,
        }).returning();

        return res.status(201).json({ 
            success: true, 
            list: newList 
        });
    } catch (error) {
        return next(error);
    }
}

// Update a list (name, visibility, or sort order)
export async function updateList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const listId = parseInt(req.params.id, 10);
        const { name, isVisible, sortOrder } = req.body;

        if (isNaN(listId) || listId <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid list ID' 
            });
        }

        // Check if list exists and belongs to user
        const list = await db.query.userLists.findFirst({
            where: and(
                eq(schema.userLists.id, listId),
                eq(schema.userLists.userId, userId)
            ),
        });

        if (!list) {
            return res.status(404).json({ 
                success: false, 
                message: 'List not found' 
            });
        }

        const updates: any = {};

        if (name !== undefined && name.trim() !== '') {
            const slug = name.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            // Check if new slug conflicts
            const existing = await db.query.userLists.findFirst({
                where: and(
                    eq(schema.userLists.userId, userId),
                    eq(schema.userLists.slug, slug),
                    sql`${schema.userLists.id} != ${listId}`
                ),
            });

            if (existing) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'A list with this name already exists' 
                });
            }

            updates.name = name.trim();
            updates.slug = slug;
        }

        if (isVisible !== undefined) {
            updates.isVisible = isVisible;
        }

        if (sortOrder !== undefined) {
            updates.sortOrder = sortOrder;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No updates provided' 
            });
        }

        updates.updatedAt = new Date();

        const [updatedList] = await db.update(schema.userLists)
            .set(updates)
            .where(and(
                eq(schema.userLists.id, listId),
                eq(schema.userLists.userId, userId)
            ))
            .returning();

        return res.json({ 
            success: true, 
            list: updatedList 
        });
    } catch (error) {
        return next(error);
    }
}

// Delete a custom list
export async function deleteList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const listId = parseInt(req.params.id, 10);

        if (isNaN(listId) || listId <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid list ID' 
            });
        }

        // Check if list exists and belongs to user
        const list = await db.query.userLists.findFirst({
            where: and(
                eq(schema.userLists.id, listId),
                eq(schema.userLists.userId, userId)
            ),
        });

        if (!list) {
            return res.status(404).json({ 
                success: false, 
                message: 'List not found' 
            });
        }

        // Prevent deletion of default lists (user can hide them instead)
        if (list.isDefault) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete default lists. You can hide them instead.' 
            });
        }

        // Delete the list (cascade will remove entries in userSeriesList)
        await db.delete(schema.userLists)
            .where(and(
                eq(schema.userLists.id, listId),
                eq(schema.userLists.userId, userId)
            ));

        return res.json({ 
            success: true, 
            message: 'List deleted successfully' 
        });
    } catch (error) {
        return next(error);
    }
}

// Get all manga in a specific list
export async function getListItems(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const listId = parseInt(req.params.id, 10);

        if (isNaN(listId) || listId <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid list ID' 
            });
        }

        // Check if list exists and belongs to user
        const list = await db.query.userLists.findFirst({
            where: and(
                eq(schema.userLists.id, listId),
                eq(schema.userLists.userId, userId)
            ),
        });

        if (!list) {
            return res.status(404).json({ 
                success: false, 
                message: 'List not found' 
            });
        }

        const results = await db.query.userSeriesList.findMany({
            where: and(
                eq(schema.userSeriesList.userId, userId),
                eq(schema.userSeriesList.listId, listId)
            ),
            with: {
                series: true,
            },
            orderBy: (userSeriesList, { desc }) => [desc(userSeriesList.updatedAt)],
        });

        const items = results.map(item => ({
            ...item.series,
            listStatus: list.slug,
            addedAt: item.updatedAt,
        }));

        return res.json({ 
            success: true, 
            list,
            items 
        });
    } catch (error) {
        return next(error);
    }
}

// Add manga to a list
export async function addToList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const listId = parseInt(req.params.id, 10);
        const { seriesId } = req.body;

        if (isNaN(listId) || listId <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid list ID' 
            });
        }

        if (!seriesId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Series ID is required' 
            });
        }

        // Check if list exists and belongs to user
        const list = await db.query.userLists.findFirst({
            where: and(
                eq(schema.userLists.id, listId),
                eq(schema.userLists.userId, userId)
            ),
        });

        if (!list) {
            return res.status(404).json({ 
                success: false, 
                message: 'List not found' 
            });
        }

        // Add or update the entry
        const [result] = await db.insert(schema.userSeriesList)
            .values({
                userId,
                seriesId,
                listId,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [schema.userSeriesList.userId, schema.userSeriesList.seriesId],
                set: { 
                    listId,
                    updatedAt: new Date() 
                },
            })
            .returning();

        return res.json({ 
            success: true, 
            message: `Manga added to ${list.name}`,
            data: result 
        });
    } catch (error) {
        return next(error);
    }
}

// Remove manga from a list
export async function removeFromList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const seriesId = Number(req.body?.seriesId ?? req.query?.seriesId);

        if (!seriesId || Number.isNaN(seriesId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Series ID is required' 
            });
        }

        await db.delete(schema.userSeriesList)
            .where(and(
                eq(schema.userSeriesList.userId, userId),
                eq(schema.userSeriesList.seriesId, seriesId)
            ));

        return res.json({ 
            success: true,
            message: 'Manga removed from all lists'
        });
    } catch (error) {
        return next(error);
    }
}

// Reorder lists
export async function reorderLists(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const userId = req.user.id;
        const { listOrders } = req.body as { listOrders: Array<{ id: number, sortOrder: number }> };

        if (!Array.isArray(listOrders) || listOrders.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'List orders array is required' 
            });
        }

        // Update all list orders in a transaction-like manner
        for (const { id, sortOrder } of listOrders) {
            await db.update(schema.userLists)
                .set({ sortOrder, updatedAt: new Date() })
                .where(and(
                    eq(schema.userLists.id, id),
                    eq(schema.userLists.userId, userId)
                ));
        }

        return res.json({ 
            success: true, 
            message: 'Lists reordered successfully' 
        });
    } catch (error) {
        return next(error);
    }
}
