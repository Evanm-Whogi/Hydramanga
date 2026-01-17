import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, gte, inArray, isNotNull, not, isNull  } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();


export default async function getHomePage(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const FeaturedIds = [1692, 6029, 5201, 3188, 247, 3397, 2410, 4323];

    const [trending, added, popular, recentComments, updated, featured, upcoming] = await Promise.all([

        // Trending
        db.select().from(schema.series).where(eq(schema.series.status, 'releasing')).orderBy(desc(schema.series.rating)).limit(8),
       
        //  Newest
        db.select().from(schema.series).where(eq(schema.series.year, 2026)).orderBy(desc(schema.series.lastUpdatedAt)).limit(8),
       
        // Most Popular
        db.select().from(schema.series).orderBy(desc(schema.series.weightedScore)).limit(8),

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
            }
        })
        .from(schema.comments)
        .innerJoin(schema.user, eq(schema.comments.userId, schema.user.id))
        .innerJoin(schema.series, eq(schema.comments.seriesId, schema.series.id))
        .orderBy(desc(schema.comments.createdAt))
        .limit(8),

        // Updated
        db.select().from(schema.series).where(isNull(schema.series.mergedWith)).orderBy(desc(schema.series.lastUpdatedAt)).limit(8),

        // Featured
        db.select().from(schema.series).where(inArray(schema.series.id, FeaturedIds)).limit(8),
        
        // Upcoming
        db.select().from(schema.series).where(eq(schema.series.status, 'upcoming')).orderBy(desc(schema.series.id)).limit(8)
    ]);

    return res.json({
        trending,
        added,
        popular,
        recentComments,
        updated,
        featured,
        upcoming
    });
}