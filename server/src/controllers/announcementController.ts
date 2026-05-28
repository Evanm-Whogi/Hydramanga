import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, gte, inArray, isNotNull, not, isNull  } from 'drizzle-orm';
import dotenv from 'dotenv';
import { recordAuditFromRequest } from '@/audit/record';
import { contentAuditMeta } from '@/audit/metadataHelpers';
dotenv.config();

// Fetch published announcements
export async function fetchAnnouncements(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const announcements = await db.select().from(schema.announcements).where(eq(schema.announcements.isPublished, true)).orderBy(desc(schema.announcements.publishedAt)).limit(10);
        return res.json(announcements);
    } catch (error) {
        return next(error);
    }
}

// Create a new announcement (admin only; content is Markdown)
export async function createAnnouncement(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const { title, content, type, isPublished } = req.body;
        const titleStr = typeof title === 'string' ? title.trim() : '';
        const contentStr = typeof content === 'string' ? content : (content != null ? String(content) : '');
        const typeStr = typeof type === 'string' && type ? type : 'info';
        const published = Boolean(isPublished);

        const [newAnnouncement] = await db.insert(schema.announcements).values({
            title: titleStr || '',
            content: contentStr,
            type: typeStr,
            isPublished: published,
            ...(published && { publishedAt: new Date() }),
        }).returning();
        recordAuditFromRequest(req, {
            action: 'announcement.create',
            category: 'admin',
            resourceType: 'announcement',
            resourceId: String(newAnnouncement.id),
            metadata: contentAuditMeta({
                href: '/',
                summary: `Published announcement: ${titleStr || 'Untitled'}`,
                title: titleStr,
                content: contentStr,
                extra: { type: typeStr, isPublished: published },
            }),
        });
        return res.status(201).json(newAnnouncement);
    } catch (error) {
        return next(error);
    }
}