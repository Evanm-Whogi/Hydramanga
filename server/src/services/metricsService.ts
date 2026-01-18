import { db, schema } from '@/db/index';
import { eq, and, sql, gte, desc } from 'drizzle-orm';
import logger from '@/services/loggerService';

interface ViewTrackingData {
  ipAddress: string;
  userAgent: string;
  userId?: string;
}

class MetricsService {
  /**
   * Track a manga view (both unique and total)
   * @param seriesId - The manga series ID
   * @param trackingData - IP, user agent, and optional user ID
   */
  async trackMangaView(seriesId: number, trackingData: ViewTrackingData): Promise<void> {
    try {
      const { ipAddress, userAgent, userId } = trackingData;

      // Check if this is a unique view (same IP + user agent in last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const existingView = await db
        .select()
        .from(schema.mangaViews)
        .where(
          and(
            eq(schema.mangaViews.seriesId, seriesId),
            eq(schema.mangaViews.ipAddress, ipAddress),
            eq(schema.mangaViews.userAgent, userAgent),
            gte(schema.mangaViews.viewedAt, oneDayAgo)
          )
        )
        .limit(1);

      const isUniqueView = existingView.length === 0;

      // Insert the view record
      await db.insert(schema.mangaViews).values({
        seriesId,
        ipAddress,
        userAgent,
        userId: userId || null,
        viewedAt: new Date(),
      });

      // Update or create the aggregated stats
      await db
        .insert(schema.mangaViewStats)
        .values({
          seriesId,
          totalViews: 1,
          uniqueViews: isUniqueView ? 1 : 0,
          lastViewedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.mangaViewStats.seriesId,
          set: {
            totalViews: sql`${schema.mangaViewStats.totalViews} + 1`,
            uniqueViews: isUniqueView 
              ? sql`${schema.mangaViewStats.uniqueViews} + 1` 
              : schema.mangaViewStats.uniqueViews,
            lastViewedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      logger.info(`Manga view tracked: seriesId=${seriesId}, unique=${isUniqueView}`, { service: 'metricsService' });
    } catch (error) {
      logger.error(`Failed to track manga view: ${error}`, { service: 'metricsService' });
      // Don't throw - we don't want tracking failures to break the user experience
    }
  }

  /**
   * Track a chapter view (both unique and total)
   * @param chapterId - The chapter ID
   * @param seriesId - The manga series ID
   * @param trackingData - IP, user agent, and optional user ID
   */
  async trackChapterView(
    chapterId: number,
    seriesId: number,
    trackingData: ViewTrackingData
  ): Promise<void> {
    try {
      const { ipAddress, userAgent, userId } = trackingData;

      // Check if this is a unique view (same IP + user agent in last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const existingView = await db
        .select()
        .from(schema.chapterViews)
        .where(
          and(
            eq(schema.chapterViews.chapterId, chapterId),
            eq(schema.chapterViews.ipAddress, ipAddress),
            eq(schema.chapterViews.userAgent, userAgent),
            gte(schema.chapterViews.viewedAt, oneDayAgo)
          )
        )
        .limit(1);

      const isUniqueView = existingView.length === 0;

      // Insert the view record
      await db.insert(schema.chapterViews).values({
        chapterId,
        seriesId,
        ipAddress,
        userAgent,
        userId: userId || null,
        viewedAt: new Date(),
      });

      // Update or create the aggregated stats
      await db
        .insert(schema.chapterViewStats)
        .values({
          chapterId,
          totalViews: 1,
          uniqueViews: isUniqueView ? 1 : 0,
          lastViewedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.chapterViewStats.chapterId,
          set: {
            totalViews: sql`${schema.chapterViewStats.totalViews} + 1`,
            uniqueViews: isUniqueView 
              ? sql`${schema.chapterViewStats.uniqueViews} + 1` 
              : schema.chapterViewStats.uniqueViews,
            lastViewedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      logger.info(`Chapter view tracked: chapterId=${chapterId}, unique=${isUniqueView}`, { service: 'metricsService' });
    } catch (error) {
      logger.error(`Failed to track chapter view: ${error}`, { service: 'metricsService' });
    }
  }

  /**
   * Get trending manga for a specific time period
   * @param days - Number of days to look back (7 for week, 30 for month, etc.)
   * @param limit - Maximum number of results
   */
  async getTrendingManga(days: number = 7, limit: number = 20) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const trendingData = await db
        .select({
          seriesId: schema.mangaViews.seriesId,
          viewCount: sql<number>`COUNT(*)`.as('view_count'),
          uniqueViewCount: sql<number>`COUNT(DISTINCT (${schema.mangaViews.ipAddress} || ${schema.mangaViews.userAgent}))`.as('unique_view_count'),
        })
        .from(schema.mangaViews)
        .where(gte(schema.mangaViews.viewedAt, startDate))
        .groupBy(schema.mangaViews.seriesId)
        .orderBy(desc(sql`view_count`))
        .limit(limit);

      // Fetch full series data for the trending manga
      const seriesIds = trendingData.map(t => t.seriesId);
      
      if (seriesIds.length === 0) {
        return [];
      }

      const seriesData = await db.query.series.findMany({
        where: (series, { inArray }) => inArray(series.id, seriesIds),
      });

      // Combine trending stats with series data
      const results = trendingData.map(trend => {
        const series = seriesData.find(s => s.id === trend.seriesId);
        return {
          ...series,
          trendingStats: {
            viewCount: trend.viewCount,
            uniqueViewCount: trend.uniqueViewCount,
            periodDays: days,
          },
        };
      });

      return results;
    } catch (error) {
      logger.error(`Failed to get trending manga: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Get view statistics for a specific manga
   * @param seriesId - The manga series ID
   */
  async getMangaStats(seriesId: number) {
    try {
      const stats = await db
        .select()
        .from(schema.mangaViewStats)
        .where(eq(schema.mangaViewStats.seriesId, seriesId))
        .limit(1);

      return stats[0] || {
        seriesId,
        totalViews: 0,
        uniqueViews: 0,
        lastViewedAt: null,
      };
    } catch (error) {
      logger.error(`Failed to get manga stats: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Get view statistics for a specific chapter
   * @param chapterId - The chapter ID
   */
  async getChapterStats(chapterId: number) {
    try {
      const stats = await db
        .select()
        .from(schema.chapterViewStats)
        .where(eq(schema.chapterViewStats.chapterId, chapterId))
        .limit(1);

      return stats[0] || {
        chapterId,
        totalViews: 0,
        uniqueViews: 0,
        lastViewedAt: null,
      };
    } catch (error) {
      logger.error(`Failed to get chapter stats: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Get all chapter stats for a manga series
   * @param seriesId - The manga series ID
   */
  async getSeriesChapterStats(seriesId: number) {
    try {
      const chapterStats = await db
        .select({
          chapterId: schema.chapterViewStats.chapterId,
          totalViews: schema.chapterViewStats.totalViews,
          uniqueViews: schema.chapterViewStats.uniqueViews,
          lastViewedAt: schema.chapterViewStats.lastViewedAt,
          chapterNumber: schema.chapters.chapterNumber,
          title: schema.chapters.title,
        })
        .from(schema.chapterViewStats)
        .innerJoin(schema.chapters, eq(schema.chapterViewStats.chapterId, schema.chapters.id))
        .where(eq(schema.chapters.seriesId, seriesId))
        .orderBy(desc(schema.chapterViewStats.totalViews));

      return chapterStats;
    } catch (error) {
      logger.error(`Failed to get series chapter stats: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }
}

export const metricsService = new MetricsService();
