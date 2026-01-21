import { db } from '@/db';
import { series, chapters } from '@/db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { cacheService } from '@/services/cacheService';
import { queueService } from '@/services/queueService';
import { discordService } from '@/services/discordService';

// Constants
const TRENDING_CACHE_KEY = 'trending:top100';
const TRENDING_CACHE_TTL = 60 * 60; // 1 hour

// Ignored manga titles
const IGNORED_TITLES = new Set(['one piece', "hajime no ippo: fighting spirit!"]); // Add more titles as needed
const isIgnored = (title: string | null | undefined) => IGNORED_TITLES.has((title || '').trim().toLowerCase());

class MangaOrchestratorService {
  // Fetch top N trending series by weighted score (cached)
  async getTopTrending(limit = 100) {
    try {
      const cached = await cacheService.get<{ id: number; title: string }[]>(TRENDING_CACHE_KEY);
      if (cached) {
        return cached.filter((r) => !isIgnored(r.title));
      }

      const rows = await db
        .select({ id: series.id, title: series.title })
        .from(series)
        .orderBy(desc(series.weightedScore), desc(series.lastUpdatedAt))
        .limit(limit);

      const filtered = rows.filter((r) => !isIgnored(r.title));

      await cacheService.set(TRENDING_CACHE_KEY, JSON.stringify(filtered), TRENDING_CACHE_TTL);
      return filtered;
    } catch (err) {
      logger.error(`Failed to fetch top trending: ${(err as Error).message}`, { service: 'mangaOrchestratorService' });
      return [];
    }
  }

  // Check if a series is in the top N trending
  async isTopTrending(seriesId: number, limit = 100) {
    const trending = await this.getTopTrending(limit);
    return trending.some((t) => t.id === seriesId);
  }

  // Schedule scans for the top trending manga (idempotent via jobId)
  async enqueueTrendingChapterScans(limit = 100) {
    logger.info(`[CRON] Enqueuing trending chapter scans (top ${limit})`, { service: 'mangaOrchestratorService' });
    const trending = await db
      .select({ id: series.id, title: series.title, romanizedTitle: series.romanizedTitle })
      .from(series)
      .orderBy(desc(series.weightedScore), desc(series.lastUpdatedAt))
      .limit(limit);
    
    const filtered = trending.filter((r) => !isIgnored(r.title));
    
    for (const row of filtered) {
      await queueService.addJob('mangaChapterImportQueue', `Trending sync ${row.title}`,
        { mangaTitle: row.title, seriesId: row.id, romanizedTitle: row.romanizedTitle },
        { jobId: `trending-${row.id}`, attempts: 3 }
      );
    }
    logger.info(`Queued trending scans for ${filtered.length} series`, { service: 'mangaOrchestratorService' });
  }

  // On-demand scan when a title is first visited (idempotent via jobId)
  async enqueueOnDemand(seriesId: number, mangaTitle: string) {
    if (isIgnored(mangaTitle)) return logger.info(`Skipping on-demand scan for ignored title ${mangaTitle}`, { service: 'mangaOrchestratorService' });

    // Check if manga already has chapters - if so, this isn't a "first scan"
    const existingChapters = await db.select().from(chapters).where(eq(chapters.seriesId, seriesId)).limit(1);
    if (existingChapters.length > 0) return logger.info(`Manga ${mangaTitle} already has chapters, skipping first scan notification`, { service: 'mangaOrchestratorService' });

    const jobId = `ondemand-${seriesId}`;
    const queue = queueService.getQueue('mangaChapterImportQueue');
    
    // Check if job already exists in queue (any state except failed)
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state !== 'failed') {
        logger.info(`Job ${jobId} already exists (state: ${state}), skipping`, { service: 'mangaOrchestratorService' });
        return;
      }
    }
    
    // Fetch romanizedTitle and cover from database
    const [manga] = await db.select({ romanizedTitle: series.romanizedTitle, cover: series.cover }).from(series).where(eq(series.id, seriesId));
    const romanizedTitle = manga?.romanizedTitle || undefined;
    const coverUrl = manga?.cover ? (manga.cover as any)?.x350?.x1 || (manga.cover as any)?.x250?.x1 || (manga.cover as any)?.raw?.url || undefined : undefined;
    
    await queueService.addJob('mangaChapterImportQueue', `On-demand sync ${mangaTitle}`, { mangaTitle, seriesId, romanizedTitle, isFirstScan: true }, { 
        jobId, 
        attempts: 2,
        removeOnComplete: { age: 300, count: 1000 } // Keep completed jobs for 5 minutes
      }
    );
    
    // Send notification for new job
    await discordService.notifyFirstMangaScan(mangaTitle, seriesId, coverUrl);
    logger.info(`Queued on-demand scan for ${mangaTitle} (${seriesId})`, { service: 'mangaOrchestratorService' });
  }

  // Rescan all non-trending manga that have chapters (auto-monitored)
  async enqueueMonitoredRescans() {
    try {
      const trending = await this.getTopTrending(100);
      const trendingIds = trending.map(t => t.id);
      
      // Find all series with at least one chapter that aren't in top trending
      let results: Array<{ id: number; title: string | null }>;
      
      if (trendingIds.length > 0) {
        results = await db
          .selectDistinct({ id: series.id, title: series.title })
          .from(series)
          .innerJoin(chapters, eq(chapters.seriesId, series.id))
          .where(sql`NOT ${inArray(series.id, trendingIds)}`);
      } else {
        results = await db
          .selectDistinct({ id: series.id, title: series.title })
          .from(series)
          .innerJoin(chapters, eq(chapters.seriesId, series.id));
      }

      // Filter out results with null titles
      const monitored = results.filter((m): m is { id: number; title: string } => m.title !== null && m.title !== undefined);
      
      let enqueuedCount = 0;
      for (const manga of monitored) {
        if (isIgnored(manga.title)) continue;
        
        await queueService.addJob('mangaChapterImportQueue', `Monitored rescan ${manga.title}`,
          { mangaTitle: manga.title, seriesId: manga.id },
          { jobId: `monitored-${manga.id}`, attempts: 2 }
        );
        enqueuedCount++;
      }
      
      logger.info(`Queued ${enqueuedCount} monitored manga rescans (${monitored.length - enqueuedCount} ignored)`, { service: 'mangaOrchestratorService' });
    } catch (err) {
      logger.error(`Failed to enqueue monitored rescans: ${(err as Error).message}`, { service: 'mangaOrchestratorService' });
    }
  }}

export const mangaOrchestratorService = new MangaOrchestratorService();
