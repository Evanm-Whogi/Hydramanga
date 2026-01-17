import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, gte, inArray, isNotNull, not, isNull  } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

export async function fetchAnnouncements(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const announcements = await db.select().from(schema.announcements).where(eq(schema.announcements.isPublished, true)).orderBy(desc(schema.announcements.publishedAt)).limit(10);
        return res.json(announcements);
    } catch (error) {
        return next(error);
    }
}

export async function createAnnouncement(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const { title, content, type, isPublished, publishedAt } = req.body;
        const [newAnnouncement] = await db.insert(schema.announcements).values({
            title,
            content,
            type,
            isPublished,
            publishedAt
        }).returning();
        return res.status(201).json(newAnnouncement);
    } catch (error) {
        return next(error);
    }
}