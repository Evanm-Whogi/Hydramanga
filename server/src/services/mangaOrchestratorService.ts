import { db } from '@/db';
import { series, chapters } from '@/db/schema';
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { cacheService } from '@/services/cacheService';
import { queueService } from '@/services/queueService';
import { getAllChapterDownloadQueueNames } from '@/lib/chapterDownloadQueues';
import { mangaProgressService, isSourceOnlyProgress } from '@/services/mangaProgressService';

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
      .select({ id: series.id, title: series.title, romanizedTitle: series.romanizedTitle, cover: series.cover })
      .from(series)
      .orderBy(desc(series.weightedScore), desc(series.lastUpdatedAt))
      .limit(limit);
    
    const filtered = trending.filter((r) => !isIgnored(r.title));
    
    for (const row of filtered) {
      const coverUrl = row.cover ? (row.cover as any)?.x350?.x1 || (row.cover as any)?.x250?.x1 || (row.cover as any)?.raw?.url || undefined : undefined;
      await queueService.addJob('mangaChapterImportQueue', `Trending sync ${row.title}`,
        { mangaTitle: row.title, seriesId: row.id, romanizedTitle: row.romanizedTitle, coverUrl },
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

    // Check if manga is already being scanned or downloaded
    const progress = await mangaProgressService.getProgress(seriesId);
    if (progress && (progress.status === 'scanning' || progress.status === 'downloading')) {
      logger.info(`Manga ${mangaTitle} (${seriesId}) is already ${progress.status}, skipping duplicate scan`, { service: 'mangaOrchestratorService' });
      return;
    }

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
    
    // Initialize progress to 'scanning' state for a first scan (no existing chapters yet)
    // This ensures WebSocket clients see the scanning state before the job is processed
    await mangaProgressService.initializeProgress(seriesId, 0, 0);
    
    // Fetch romanizedTitle and cover from database
    const [manga] = await db.select({ romanizedTitle: series.romanizedTitle, cover: series.cover }).from(series).where(eq(series.id, seriesId));
    const romanizedTitle = manga?.romanizedTitle || undefined;
    const coverUrl = manga?.cover ? (manga.cover as any)?.x350?.x1 || (manga.cover as any)?.x250?.x1 || (manga.cover as any)?.raw?.url || undefined : undefined;
    
    await queueService.addJob('mangaChapterImportQueue', `On-demand sync ${mangaTitle}`, { mangaTitle, seriesId, romanizedTitle, isFirstScan: true, coverUrl }, { 
        jobId, 
        attempts: 2,
        removeOnComplete: { age: 300, count: 1000 } // Keep completed jobs for 5 minutes
      }
    );
    
    logger.info(`Queued on-demand scan for ${mangaTitle} (${seriesId})`, { service: 'mangaOrchestratorService' });
  }

  // Enqueue a single rescan for one series (admin or manual). Always enqueues a chapter-scan job to check for new chapters.
  async enqueueSingleRescan(seriesId: number): Promise<{ queued: boolean; reason?: string }> {
    const [manga] = await db
      .select({ title: series.title, romanizedTitle: series.romanizedTitle, cover: series.cover })
      .from(series)
      .where(eq(series.id, seriesId))
      .limit(1);
    if (!manga?.title) {
      logger.warn(`enqueueSingleRescan: series ${seriesId} not found`, { service: 'mangaOrchestratorService' });
      return { queued: false, reason: 'series_not_found' };
    }
    const progress = await mangaProgressService.getProgress(seriesId);
    if (progress && (progress.status === 'scanning' || progress.status === 'downloading')) {
      logger.info(`Series ${seriesId} is already ${progress.status}, skipping rescan`, { service: 'mangaOrchestratorService' });
      return { queued: false, reason: 'already_active' };
    }
    const coverUrl = manga.cover ? (manga.cover as any)?.x350?.x1 || (manga.cover as any)?.x250?.x1 || (manga.cover as any)?.raw?.url : undefined;
    await queueService.addJob('mangaChapterImportQueue', `Rescan ${manga.title}`, {
      mangaTitle: manga.title,
      seriesId,
      romanizedTitle: manga.romanizedTitle || undefined,
      isFirstScan: false,
      coverUrl,
    }, { jobId: `rescan-${seriesId}`, attempts: 2 });
    logger.info(`Queued rescan for series ${seriesId} (${manga.title})`, { service: 'mangaOrchestratorService' });
    return { queued: true };
  }

  // Get scan status: progress status + whether a job is queued
  async getScanStatus(seriesId: number): Promise<{ scanStatus: string; isQueued: boolean }> {
    const progress = await mangaProgressService.getProgress(seriesId);
    if (progress && (progress.status === 'scanning' || progress.status === 'downloading')) {
      return { scanStatus: progress.status, isQueued: false };
    }
    if (progress && isSourceOnlyProgress(progress)) {
      return { scanStatus: 'source_set', isQueued: false };
    }
    if (progress && (progress.status === 'completed' || progress.status === 'failed')) {
      return { scanStatus: progress.status, isQueued: false };
    }
    const scanQueue = queueService.getQueue('mangaChapterImportQueue');
    const possibleScanJobIds = [`rescan-${seriesId}`, `ondemand-${seriesId}`, `trending-${seriesId}`, `monitored-${seriesId}`];
    for (const jobId of possibleScanJobIds) {
      try {
        const job = await scanQueue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state === 'waiting' || state === 'delayed' || state === 'active') {
            return { scanStatus: state === 'active' ? 'scanning' : 'queued', isQueued: state !== 'active' };
          }
        }
      } catch {
        // Job not found, try next
      }
    }
    return { scanStatus: 'idle', isQueued: false };
  }

  // Cancel active scan for a series: remove scan job and chapter download jobs from queues
  async cancelScan(seriesId: number): Promise<{ scanJobRemoved: boolean; chapterJobsRemoved: number }> {
    const scanQueue = queueService.getQueue('mangaChapterImportQueue');
    const downloadQueueNames = getAllChapterDownloadQueueNames();
    const possibleScanJobIds = [`rescan-${seriesId}`, `ondemand-${seriesId}`, `trending-${seriesId}`, `monitored-${seriesId}`];

    let scanJobRemoved = false;
    for (const jobId of possibleScanJobIds) {
      try {
        const job = await scanQueue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state === 'waiting' || state === 'delayed') {
            await job.remove();
            scanJobRemoved = true;
            logger.info(`Removed scan job ${jobId} from queue`, { service: 'mangaOrchestratorService' });
            break;
          }
          if (state === 'active') {
            await job.remove();
            scanJobRemoved = true;
            logger.info(`Removed active scan job ${jobId} from queue`, { service: 'mangaOrchestratorService' });
            break;
          }
        }
      } catch (err) {
        logger.debug(`No scan job ${jobId} or already removed: ${(err as Error).message}`, { service: 'mangaOrchestratorService' });
      }
    }

    let chapterJobsRemoved = 0;
    try {
      const seriesIdNum = Number(seriesId);
      for (const downloadQueueName of downloadQueueNames) {
        const downloadQueue = queueService.getQueue(downloadQueueName);
        const [waitingJobs, prioritizedJobs, activeJobs] = await Promise.all([
          downloadQueue.getJobs(['waiting'], 0, 500, true),
          downloadQueue.getJobs(['prioritized'], 0, 500, true),
          downloadQueue.getJobs(['active'], 0, 500, true),
        ]);
        const allJobs = [...waitingJobs, ...prioritizedJobs, ...activeJobs];
        for (const job of allJobs) {
          if (Number(job?.data?.seriesId) === seriesIdNum) {
            try {
              await job.remove();
              chapterJobsRemoved++;
            } catch (err) {
              logger.warn(`Failed to remove chapter job ${job.id} from ${downloadQueueName}: ${(err as Error).message}`, { service: 'mangaOrchestratorService' });
            }
          }
        }
      }
      if (chapterJobsRemoved > 0) {
        logger.info(`Removed ${chapterJobsRemoved} chapter download jobs for series ${seriesId}`, { service: 'mangaOrchestratorService' });
      }
    } catch (err) {
      logger.warn(`Failed to get/remove chapter jobs: ${(err as Error).message}`, { service: 'mangaOrchestratorService' });
    }

    return { scanJobRemoved, chapterJobsRemoved };
  }

  // Rescan all non-trending manga that have chapters (auto-monitored)
  async enqueueMonitoredRescans() {
    try {
      const trending = await this.getTopTrending(100);
      const trendingIds = trending.map(t => t.id);
      
      // Find all series with at least one chapter that aren't in top trending; skip completed manga
      const notCompleted = or(isNull(series.status), ne(series.status, 'completed'));
      let results: Array<{ id: number; title: string | null; cover: unknown }>;
      
      if (trendingIds.length > 0) {
        results = await db
          .selectDistinct({ id: series.id, title: series.title, cover: series.cover })
          .from(series)
          .innerJoin(chapters, eq(chapters.seriesId, series.id))
          .where(and(sql`NOT ${inArray(series.id, trendingIds)}`, notCompleted));
      } else {
        results = await db
          .selectDistinct({ id: series.id, title: series.title, cover: series.cover })
          .from(series)
          .innerJoin(chapters, eq(chapters.seriesId, series.id))
          .where(notCompleted);
      }

      // Filter out results with null titles
      const monitored = results.filter((m): m is { id: number; title: string; cover: unknown } => m.title !== null && m.title !== undefined);
      
      let enqueuedCount = 0;
      for (const manga of monitored) {
        if (isIgnored(manga.title)) continue;
        const coverUrl = manga.cover ? (manga.cover as any)?.x350?.x1 || (manga.cover as any)?.x250?.x1 || (manga.cover as any)?.raw?.url || undefined : undefined;
        await queueService.addJob('mangaChapterImportQueue', `Monitored rescan ${manga.title}`,
          { mangaTitle: manga.title, seriesId: manga.id, coverUrl },
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
