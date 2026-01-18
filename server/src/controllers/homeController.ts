import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, gte, inArray, isNotNull, not, isNull  } from 'drizzle-orm';
import { metricsService } from '@/services/metricsService';
import dotenv from 'dotenv';
dotenv.config();

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

export default async function getHomePage(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const FeaturedIds = [1692, 6029, 5201, 3188, 247, 3397, 2410, 4323];

    const [trending, addedRaw, popularRaw, recentComments, updatedRaw, featuredRaw, upcomingRaw] = await Promise.all([

        // Trending - Using actual metrics/tracking data (7 days = week)
        metricsService.getTrendingManga(7, 8),
       
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

    // Enrich all lists with view stats
    const [added, popular, updated, featured, upcoming] = await Promise.all([
        enrichWithViewStats(addedRaw),
        enrichWithViewStats(popularRaw),
        enrichWithViewStats(updatedRaw),
        enrichWithViewStats(featuredRaw),
        enrichWithViewStats(upcomingRaw),
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