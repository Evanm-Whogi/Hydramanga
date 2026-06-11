import { db, schema } from '@/db/index';
import { eq, and, sql, gte, desc, inArray } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { cacheService } from '@/services/cacheService';
import { shouldFilterManga, isNovelType, getExcludeNovelConditions } from '@/config/contentFilter';
import { fetchSeriesChapterFlags, seriesCardColumns } from '@/lib/seriesQueries';
import { series } from '@/db/schema';

const CACHE_TTL = {
  TRENDING: 1800, // 30 minutes - trending is stable
  STATS: 3600, // 1 hour - stats update less frequently
};

const CACHE_KEYS = {
  TRENDING: (days: number, limit: number) => `trending:${days}d:${limit}`,
  MANGA_STATS: (seriesId: number) => `manga:${seriesId}:stats`,
  CHAPTER_STATS: (chapterId: number) => `chapter:${chapterId}:stats`,
  SERIES_CHAPTER_STATS: (seriesId: number) => `series:${seriesId}:chapterstats`,
};

interface ViewTrackingData {
  ipAddress: string;
  userAgent: string;
  userId?: string;
}

export type SeriesChapterStatsRow = {
  chapterId: number;
  totalViews: number | null;
  uniqueViews: number | null;
  lastViewedAt: Date | null;
  chapterNumber: string;
  title: string | null;
};

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

      // Invalidate cache - trending and manga stats changed
      await cacheService.invalidatePattern(`manga:*:stats`);
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

      await cacheService.invalidateTag('chapter_stats');
      await cacheService.invalidateTag('series_stats');

      logger.info(`Chapter view tracked: chapterId=${chapterId}, unique=${isUniqueView}`, { service: 'metricsService' });
    } catch (error) {
      logger.error(`Failed to track chapter view: ${error}`, { service: 'metricsService' });
    }
  }

  /**
   * Get trending manga for a specific time period
   * Uses pre-aggregated mangaViewStats for much faster queries
   * @param days - Number of days to look back (7 for week, 30 for month, etc.)
   * @param limit - Maximum number of results
   */
  async getTrendingManga(days: number = 7, limit: number = 20) {
    try {
      const cacheKey = CACHE_KEYS.TRENDING(days, limit);

      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`Trending cache hit for ${days}d:${limit}`, { service: 'metricsService' });
        return cached;
      }

      // Use pre-aggregated stats table instead of scanning mangaViews
      // This is 100-1000x faster than the old GROUP BY query
      const trendingStats = await db
        .select()
        .from(schema.mangaViewStats)
        .orderBy(desc(schema.mangaViewStats.totalViews))
        .limit(limit);

      // If no stats yet, fall back to old logic (first run)
      let trendingData: typeof trendingStats;
      if (trendingStats.length === 0) {
        logger.warn(`No trending stats found, falling back to mangaViews scan`, {
          service: 'metricsService',
        });

        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const fallbackData = await db
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

        trendingData = fallbackData as any;
      } else {
        trendingData = trendingStats;
      }

      // Fetch full series data for the trending manga
      const seriesIds = trendingData.map((t: any) => t.seriesId);

      if (seriesIds.length === 0) {
        return [];
      }

      const seriesData = await db
        .select(seriesCardColumns)
        .from(series)
        .where(and(inArray(series.id, seriesIds), ...getExcludeNovelConditions(series)));

      const { importedIds } = await fetchSeriesChapterFlags(seriesIds);

      // Combine trending stats with series data
      const results = trendingData.map((trend: any) => {
        const row = seriesData.find((s) => s.id === trend.seriesId);
        return {
          ...row,
          hasImportedChapters: importedIds.has(trend.seriesId),
          trendingStats: {
            viewCount: trend.viewCount || trend.totalViews,
            uniqueViewCount: trend.uniqueViewCount || trend.uniqueViews,
            periodDays: days,
          },
        };
      })
      .filter(item => !shouldFilterManga(item.genres as any) && !isNovelType(item.type as string | null)); // Filter out blocked content and novels

      // Cache the result
      await cacheService.set(cacheKey, results, CACHE_TTL.TRENDING, ['trending']);

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
      const cacheKey = CACHE_KEYS.MANGA_STATS(seriesId);

      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`Manga stats cache hit for ${seriesId}`, { service: 'metricsService' });
        return cached;
      }

      const stats = await db
        .select()
        .from(schema.mangaViewStats)
        .where(eq(schema.mangaViewStats.seriesId, seriesId))
        .limit(1);

      const totalBookmarks = await db
        .select({ count: sql<number>`COUNT(*)`.as('count') })
        .from(schema.seriesBookmarks)
        .where(eq(schema.seriesBookmarks.seriesId, seriesId))
        .limit(1);

      const totalFollowers = await db
        .select({ count: sql<number>`COUNT(*)`.as('count') })
        .from(schema.seriesBookmarks)
        .where(
          and(
            eq(schema.seriesBookmarks.seriesId, seriesId),
          )
        );

      const result = {
        seriesId,
        totalViews: stats[0]?.totalViews || 0,
        uniqueViews: stats[0]?.uniqueViews || 0,
        bookmarks: totalBookmarks[0]?.count || 0,
        followers: totalFollowers[0]?.count || 0,
        lastViewedAt: stats[0]?.lastViewedAt || null,
      };

      // Cache the result
      await cacheService.set(cacheKey, result, CACHE_TTL.STATS, ['manga_stats']);

      return result;
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
      const cacheKey = CACHE_KEYS.CHAPTER_STATS(chapterId);

      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`Chapter stats cache hit for ${chapterId}`, { service: 'metricsService' });
        return cached;
      }

      const stats = await db
        .select()
        .from(schema.chapterViewStats)
        .where(eq(schema.chapterViewStats.chapterId, chapterId))
        .limit(1);

      const result = stats[0] || {
        chapterId,
        totalViews: 0,
        uniqueViews: 0,
        lastViewedAt: null,
      };

      // Cache the result
      await cacheService.set(cacheKey, result, CACHE_TTL.STATS, ['chapters']);

      return result;
    } catch (error) {
      logger.error(`Failed to get chapter stats: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Get all chapter stats for a manga series
   * @param seriesId - The manga series ID
   */
  async getSeriesChapterStats(seriesId: number): Promise<SeriesChapterStatsRow[]> {
    try {
      const cacheKey = CACHE_KEYS.SERIES_CHAPTER_STATS(seriesId);
      const cached = await cacheService.get<SeriesChapterStatsRow[]>(cacheKey);
      if (cached) {
        logger.debug(`Series chapter stats cache hit for ${seriesId}`, { service: 'metricsService' });
        return cached;
      }

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

      await cacheService.set(cacheKey, chapterStats, CACHE_TTL.STATS, ['series_stats']);
      return chapterStats;
    } catch (error) {
      logger.error(`Failed to get series chapter stats: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Get user's manga view history
   * Returns only the most recent view for each unique manga with reading time
   * @param userId - The user ID
   * @param limit - Maximum number of results to return
   */
  async getUserViewHistory(userId: string, limit: number = 50) {
    try {
      // First, get the reading time aggregates per series
      const readingTimeAgg = await db
        .select({
          seriesId: schema.userReadingTime.seriesId,
          totalSeconds: sql<number>`SUM(${schema.userReadingTime.seconds})`.as('total_seconds'),
        })
        .from(schema.userReadingTime)
        .where(eq(schema.userReadingTime.userId, userId))
        .groupBy(schema.userReadingTime.seriesId);

      // Convert to a map for easy lookup
      const readingTimeMap = new Map(
        readingTimeAgg.map((rt: any) => [rt.seriesId, rt.totalSeconds || 0])
      );

      // Now get the view history
      const viewHistory = await db
        .select({
          seriesId: schema.series.id,
          viewedAt: sql<Date>`MAX(${schema.mangaViews.viewedAt})`.as('viewedAt'),
          seriesTitle: schema.series.title,
          seriesCover: schema.series.cover,
          rating: schema.series.rating,
        })
        .from(schema.mangaViews)
        .innerJoin(schema.series, eq(schema.mangaViews.seriesId, schema.series.id))
        .where(and(eq(schema.mangaViews.userId, userId), ...getExcludeNovelConditions(schema.series)))
        .groupBy(schema.series.id, schema.series.title, schema.series.cover, schema.series.rating)
        .orderBy(desc(sql`MAX(${schema.mangaViews.viewedAt})`))
        .limit(limit);

      // Map reading time into results
      return viewHistory.map((item: any) => ({
        ...item,
        readingTimeSeconds: readingTimeMap.get(item.seriesId) || 0,
      }));
    } catch (error) {
      logger.error(`Failed to get user view history: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Delete all views of a specific manga for a user
   * @param userId - The user ID
   * @param seriesId - The series ID
   */
  async deleteViewHistory(userId: string, seriesId: number) {
    try {
      await db
        .delete(schema.mangaViews)
        .where(
          and(
            eq(schema.mangaViews.userId, userId),
            eq(schema.mangaViews.seriesId, seriesId)
          )
        );

      logger.info(`View history deleted: userId=${userId}, seriesId=${seriesId}`, {
        service: 'metricsService',
      });
    } catch (error) {
      logger.error(`Failed to delete view history: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  /**
   * Clear all view history for a user
   * @param userId - The user ID
   */
  async clearAllViewHistory(userId: string) {
    try {
      await db.delete(schema.mangaViews).where(eq(schema.mangaViews.userId, userId));

      logger.info(`All view history cleared for userId=${userId}`, {service: 'metricsService',});
    } catch (error) {
      logger.error(`Failed to clear all view history: ${error}`, { service: 'metricsService' });
      throw error;
    }
  }

  async trackListView(listId: number, trackingData: ViewTrackingData): Promise<void> {
    try {
      const { ipAddress, userAgent, userId } = trackingData;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const existingView = await db
        .select()
        .from(schema.listViews)
        .where(
          and(
            eq(schema.listViews.listId, listId),
            eq(schema.listViews.ipAddress, ipAddress),
            eq(schema.listViews.userAgent, userAgent),
            gte(schema.listViews.viewedAt, oneDayAgo)
          )
        )
        .limit(1);

      const isUniqueView = existingView.length === 0;

      await db.insert(schema.listViews).values({
        listId,
        ipAddress,
        userAgent,
        userId: userId || null,
        viewedAt: new Date(),
      });

      await db
        .insert(schema.listViewStats)
        .values({
          listId,
          totalViews: 1,
          uniqueViews: isUniqueView ? 1 : 0,
          lastViewedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.listViewStats.listId,
          set: {
            totalViews: sql`${schema.listViewStats.totalViews} + 1`,
            uniqueViews: isUniqueView ? sql`${schema.listViewStats.uniqueViews} + 1` : schema.listViewStats.uniqueViews,
            lastViewedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      await db.update(schema.curatedLists)
        .set({ viewCount: sql`${schema.curatedLists.viewCount} + 1` })
        .where(eq(schema.curatedLists.id, listId));
    } catch (error) {
      logger.error(`Failed to track list view: ${error}`, { service: 'metricsService' });
    }
  }

  async getListViewStats(listId: number) {
    const [stats] = await db
      .select()
      .from(schema.listViewStats)
      .where(eq(schema.listViewStats.listId, listId))
      .limit(1);
    return stats ?? null;
  }
}

export const metricsService = new MetricsService();