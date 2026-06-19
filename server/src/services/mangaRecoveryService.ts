/**
 * Manga Recovery Service
 * 
 * Handles recovery of incomplete manga downloads after server restart.
 * When Redis is cleared but manga_import_progress still shows active status,
 * this service resumes or fixes the incomplete state.
 */

import { db } from '@/db';
import { mangaImportProgress, chapters, series } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { queueService } from '@/services/queueService';
import { mangaProgressService } from '@/services/mangaProgressService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import logger from '@/services/loggerService';
import { isNovelType } from '@/config/contentFilter';

class MangaRecoveryService {
  /**
   * Recover incomplete manga downloads.
   *
   * On startup (no `staleMinutes`) every series stuck in 'scanning'/'downloading'
   * is reconciled, since nothing is in-flight yet. When run periodically (cron),
   * pass `staleMinutes` so only series whose progress hasn't advanced for that long
   * are touched — otherwise an actively-downloading series (whose `updatedAt` is
   * recent) would be re-scanned and have its progress reset mid-download.
   */
  async recoverIncompleteDownloads(options?: { staleMinutes?: number }): Promise<void> {
    const staleMinutes = options?.staleMinutes;
    try {
      logger.info(
        `[RECOVERY] Starting recovery check for incomplete manga downloads${staleMinutes ? ` (stale > ${staleMinutes}m)` : ''}...`,
        { service: 'mangaRecoveryService' }
      );

      // Find all manga with active download/scan status. When reconciling on a
      // schedule, restrict to ones that have actually stalled (no recent update).
      const incompleteProgress = await db
        .select()
        .from(mangaImportProgress)
        .where(
          staleMinutes
            ? sql`${mangaImportProgress.status} IN ('scanning', 'downloading') AND ${mangaImportProgress.updatedAt} < now() - make_interval(mins => ${staleMinutes})`
            : sql`${mangaImportProgress.status} IN ('scanning', 'downloading')`
        );

      if (incompleteProgress.length === 0) {
        logger.info('[RECOVERY] No incomplete downloads found', { service: 'mangaRecoveryService' });
        return;
      }

      logger.info(`[RECOVERY] Found ${incompleteProgress.length} incomplete manga to check`, { service: 'mangaRecoveryService' });

      let recovered = 0;
      let failed = 0;
      let completed = 0;

      for (const progress of incompleteProgress) {
        try {
          await this.recoverSingleManga(progress);
          recovered++;
        } catch (error) {
          logger.error(
            `[RECOVERY] Failed to recover manga ${progress.seriesId}: ${error}`,
            { service: 'mangaRecoveryService' }
          );
          failed++;
        }
      }

      logger.info(
        `[RECOVERY] Recovery complete: ${recovered} recovered, ${completed} already complete, ${failed} failed`,
        { service: 'mangaRecoveryService' }
      );
    } catch (error) {
      logger.error(`[RECOVERY] Recovery process failed: ${error}`, { service: 'mangaRecoveryService' });
    }
  }

  /**
   * Recover a single manga's incomplete download
   */
  private async recoverSingleManga(progress: any): Promise<void> {
    const { seriesId, totalChapters, downloadedChapters, status } = progress;

    // Get manga details
    const [manga]: any = await db
      .select({ title: series.title, romanizedTitle: series.romanizedTitle, type: series.type })
      .from(series)
      .where(eq(series.id, seriesId));

    if (!manga) {
      logger.warn(`[RECOVERY] Manga ${seriesId} not found, cleaning up progress`, { service: 'mangaRecoveryService' });
      await mangaProgressService.markFailed(seriesId, 'Manga no longer exists');
      return;
    }

    if (isNovelType(manga.type)) {
      logger.info(`[RECOVERY] Skipping novel "${manga.title}" (${seriesId})`, { service: 'mangaRecoveryService' });
      await mangaProgressService.markFailed(seriesId, 'Novels are not supported for chapter import');
      return;
    }

    // Count actual chapters in database
    const actualChapters = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chapters)
      .where(eq(chapters.seriesId, seriesId));

    const actualCount = actualChapters[0]?.count || 0;

    logger.info(
      `[RECOVERY] Manga "${manga.title}" (${seriesId}): status=${status}, expected=${totalChapters}, actual=${actualCount}, recorded=${downloadedChapters}`,
      { service: 'mangaRecoveryService' }
    );

    // Case 1: Already complete (all chapters downloaded)
    if (totalChapters > 0 && actualCount >= totalChapters) {
      logger.info(
        `[RECOVERY] Manga ${seriesId} is already complete (${actualCount}/${totalChapters}), marking as completed`,
        { service: 'mangaRecoveryService' }
      );
      await mangaProgressService.markCompleted(seriesId, actualCount);
      return;
    }

    // Case 2: Stuck in scanning state (no total yet, or old stale scan)
    if (status === 'scanning') {
      // Admin source-select used to insert status=scanning with no job — do not auto-scan on recovery.
      if (totalChapters === 0 && actualCount === 0 && progress.scraperUrl) {
        const { scanStatus, isQueued } = await mangaOrchestratorService.getScanStatus(seriesId);
        if (scanStatus !== 'scanning' && scanStatus !== 'queued' && !isQueued) {
          await db
            .update(mangaImportProgress)
            .set({
              status: 'source_set',
              totalChapters: 0,
              downloadedChapters: 0,
              errorMessage: null,
              completedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(mangaImportProgress.seriesId, seriesId));
          await mangaProgressService.cleanupProgress(seriesId);
          logger.info(
            `[RECOVERY] Manga ${seriesId} had false scanning state (source only), reset to source_set`,
            { service: 'mangaRecoveryService' }
          );
          return;
        }
      }

      logger.info(
        `[RECOVERY] Manga ${seriesId} stuck in scanning state, re-queuing scan`,
        { service: 'mangaRecoveryService' }
      );
      await this.requeueScan(seriesId, manga.title, manga.romanizedTitle);
      return;
    }

    // Case 3: Incomplete download - need to resume
    if (status === 'downloading' && totalChapters > 0 && actualCount < totalChapters) {
      // Don't stack scans: if one is already queued/running for this series, let it finish.
      const { scanStatus, isQueued } = await mangaOrchestratorService.getScanStatus(seriesId);
      if (scanStatus === 'scanning' || scanStatus === 'queued' || isQueued) {
        logger.info(
          `[RECOVERY] Manga ${seriesId} incomplete but a scan is already ${scanStatus}; skipping re-queue`,
          { service: 'mangaRecoveryService' }
        );
        return;
      }

      const missing = totalChapters - actualCount;
      logger.info(
        `[RECOVERY] Manga ${seriesId} incomplete (${actualCount}/${totalChapters}), ${missing} chapters missing. Re-queuing scan to find missing chapters`,
        { service: 'mangaRecoveryService' }
      );

      // Re-queue a scan to find and download missing chapters
      // The scanner will skip chapters that already exist
      await this.requeueScan(seriesId, manga.title, manga.romanizedTitle, false);
      return;
    }

    // Case 4: Uncertain state - mark as failed for manual review
    logger.warn(
      `[RECOVERY] Manga ${seriesId} in uncertain state (status=${status}, total=${totalChapters}, actual=${actualCount}), marking as failed`,
      { service: 'mangaRecoveryService' }
    );
    await mangaProgressService.markFailed(
      seriesId,
      `Recovery failed: uncertain state after restart (recorded: ${downloadedChapters}/${totalChapters}, actual: ${actualCount})`
    );
  }

  /**
   * Re-queue a chapter scan/download job
   */
  private async requeueScan(
    seriesId: number,
    mangaTitle: string,
    romanizedTitle?: string | null,
    isFirstScan: boolean = false
  ): Promise<void> {
    const jobId = `recovery-${seriesId}-${Date.now()}`;
    
    // Reset progress to scanning state
    await mangaProgressService.initializeProgress(seriesId);

    await queueService.addJob(
      'mangaChapterImportQueue',
      `Recovery scan: ${mangaTitle}`,
      {
        mangaTitle,
        seriesId,
        romanizedTitle: romanizedTitle || undefined,
        isFirstScan: isFirstScan,
        // Recovery rescans re-download previously-failed chapters; suppress the
        // "new chapter" notifications/webhooks so each 30-min reconcile doesn't spam.
        isRecovery: true,
      },
      {
        jobId,
        attempts: 2,
        removeOnComplete: { age: 300, count: 1000 },
      }
    );

    logger.info(
      `[RECOVERY] Queued recovery scan for "${mangaTitle}" (${seriesId}) with job ID: ${jobId}`,
      { service: 'mangaRecoveryService' }
    );
  }
}

export const mangaRecoveryService = new MangaRecoveryService();
