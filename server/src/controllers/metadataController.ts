import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { desc } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { metricsService } from '@/services/metricsService';

// Metadata-only endpoint for homepage social media previews
// Returns only trending and popular manga - minimal data for bots/crawlers
export async function getHomeMetadata(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const FETCH_LIMIT = 24;

        const [trending, popular] = await Promise.all([
            // Trending - Using actual metrics/tracking data (7 days = week)
            metricsService.getTrendingManga(7, FETCH_LIMIT),

            // Most Popular
            db.query.series.findMany({
                orderBy: [desc(schema.series.weightedScore)],
                limit: FETCH_LIMIT,
            }),
        ]);

        return res.json({
            trending: trending || [],
            popular: popular || [],
        });
    } catch (error) {
        logger.error(`Failed to get home metadata: ${(error as Error).message}`, { service: 'homeMetadataController' });
        // Return generic error response without exposing error details
        return res.status(500).json({ 
            message: "Failed to fetch homepage metadata",
            trending: [],
            popular: []
        });
    }
}
