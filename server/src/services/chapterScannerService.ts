/**
 * Chapter Scanner Service
 * Handles chapter discovery and synchronization
 * Responsibilities:
 * - Scrape chapter metadata from sources
 * - Identify new chapters
 * - Queue discovered chapters for download
 * - Track progress
 * - Send notifications
 */

import type { Job } from 'bullmq';
import { db } from '@/db';
import { chapters, series, mangaImportProgress } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { scraperManager } from '@/scrapers';
import { queueService } from '@/services/queueService';
import { discordService } from '@/services/discordService';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { appConfig } from '@/config/appConfig';
import * as Sentry from "@sentry/node";
import { withSpan, addBreadcrumb } from '@/utils/sentryHelper';
import { clampProgress, setJobProgress } from '@/utils/jobProgress';
import { scraperTitleOptions } from '@/lib/catalogTitles';
import { isNovelType } from '@/config/contentFilter';

export class ChapterScannerService {
    /**
     * Scan for missing chapters and queue them for download
     * @param mangaTitle - Title of the manga to scan
     * @param seriesId - ID of the series in database
     * @param romanizedTitle - Romanized title for better search results
     * @param isFirstScan - Whether this is the first scan for the series
     */
    static async scanForNewChapters(
        mangaTitle: string,
        seriesId: number,
        romanizedTitle?: string,
        isFirstScan = false,
        job?: Job,
        // Recovery rescans only re-download chapters that previously failed (and so
        // aren't in the DB yet). They re-discover the same chapters every cycle, so
        // emitting "new chapter" notifications/webhooks here would spam users on each
        // 30-min reconcile. Genuine new-release detection is the monitored rescan's job.
        isRecovery = false
    ): Promise<void> {
        const [typeRow] = await db.select({ type: series.type, volumeSourced: series.volumeSourced }).from(series).where(eq(series.id, seriesId)).limit(1);
        if (isNovelType(typeRow?.type)) {
            logger.info(`Skipping chapter scan for novel ${mangaTitle} (${seriesId})`, { service: 'chapterScannerService' });
            await mangaProgressService.markFailed(seriesId, 'Novels are not supported for chapter import');
            return;
        }
        // Volume-organised series (archive volume-pack ingest): the scraper's real chapter
        // numbers would collide with the volume numbering, so never scrape it.
        if (typeRow?.volumeSourced) {
            logger.info(`Skipping chapter scan for volume-sourced series ${mangaTitle} (${seriesId})`, { service: 'chapterScannerService' });
            return;
        }

        await setJobProgress(job, 5);
        let foundCount = 0;
        let previewRemaining = isFirstScan ? appConfig.queues.chapterDownload.previewCount : 0;

        // Determine how many chapters already exist before this scan (important for rescans)
        const existingChapters = await withSpan(
            'fetch_existing_chapters_before_scan',
            async () => {
                return db
                    .select({ id: chapters.id })
                    .from(chapters)
                    .where(eq(chapters.seriesId, seriesId));
            },
            { op: 'db.read', tags: { series_id: String(seriesId) } }
        );
        const baseChapterCount = existingChapters.length;

        // Initialize progress tracking:
        // - First scan: baseChapterCount will be 0 (no chapters yet)
        // - Rescans: baseChapterCount represents already downloaded chapters
        // Returns false when an in-flight import with a higher total was preserved
        // (overlapping rescan/recovery must not wipe 97 → 10 mid-download).
        const progressReset = await withSpan(
            'initialize_progress_tracking',
            async () => mangaProgressService.initializeProgress(seriesId, baseChapterCount, baseChapterCount),
            { op: 'db.write', tags: { series_id: String(seriesId) } }
        );
        if (!progressReset) {
            // In-flight totals preserved — keep discovering/queueing without having wiped progress.
            logger.info(
                `[SCANNER] Continuing scan for ${mangaTitle} (${seriesId}) without resetting in-flight progress`,
                { service: 'chapterScannerService' }
            );
        }
        await setJobProgress(job, 10);

        // Fetch cover image, native title for Discord notifications and search filtering
        const [manga] = await withSpan(
            'fetch_manga_metadata',
            async () => {
                return db
                    .select({ 
                        cover: series.cover,
                        titles: series.titles,
                        genres: series.genres,
                        genresV2: series.genresV2,
                    })
                    .from(series)
                    .where(eq(series.id, seriesId));
            },
            { op: 'db.read', tags: { series_id: String(seriesId) } }
        );
        
        const coverUrl = manga?.cover
            ? (manga.cover as any)?.x350?.x1 ||
              (manga.cover as any)?.x250?.x1 ||
              (manga.cover as any)?.raw?.url ||
              undefined
            : undefined;

                const titleOpts = scraperTitleOptions(manga?.titles);

        // Fetch saved scraper URL from import progress (avoids re-searching on rescans)
        const [progress] = await db
            .select({ scraperUrl: mangaImportProgress.scraperUrl, scraperId: mangaImportProgress.scraperId })
            .from(mangaImportProgress)
            .where(eq(mangaImportProgress.seriesId, seriesId))
            .limit(1);

        Sentry.addBreadcrumb({
            message: 'Chapter scan started',
            level: 'info',
            data: {
                series_id: seriesId,
                manga_title: mangaTitle,
                is_first_scan: isFirstScan,
                has_cover: !!coverUrl,
            },
        });
        await setJobProgress(job, 15);

        try {
            // Start scraping using scraper manager with priority fallback
            const scraper = await withSpan(
                'initialize_scraper',
                async () => {
                    return scraperManager.scrapeChapters(
                        mangaTitle,
                        async (num) => {
                            const existing = await db
                                .select()
                                .from(chapters)
                                .where(
                                    and(
                                        eq(chapters.seriesId, seriesId),
                                        eq(chapters.chapterNumber, num)
                                    )
                                )
                                .limit(1);
                            
                            const exists = existing.length > 0;
                            if (exists) {
                                logger.info(`[SCANNER] Skipping chapter ${num} - already exists in DB.`);
                            }
                            return exists;
                        },
                        seriesId,
                        titleOpts.romanizedTitle,
                        titleOpts.nativeTitle,
                        titleOpts.secondaryTitles,
                        coverUrl,
                        progress?.scraperUrl ?? undefined,
                        progress?.scraperId ?? undefined,
                    );
                },
                { op: 'scraper.init', tags: { series_id: String(seriesId) } }
            );

            // Process scraped chapters
            const seenChapters = new Set<string>(); // Track chapters already queued in this session to avoid duplicates
            let firstScraperId: string | null = null; // Track which scraper found the first chapter
            
            for await (const chapter of scraper) {
                try {
                    // Skip if we've already queued this chapter in this session
                    if (seenChapters.has(chapter.number)) {
                        logger.debug(
                            `[SCANNER] Skipping duplicate chapter ${chapter.number} (already queued in this session)`,
                            { service: 'chapterScannerService' }
                        );
                        continue;
                    }
                    seenChapters.add(chapter.number);

                    // Capture scraper ID from the first chapter
                    if (firstScraperId === null && chapter.scraperId) {
                        firstScraperId = chapter.scraperId;
                    }

                    const isPreview = previewRemaining > 0;
                    if (isPreview) previewRemaining--;
                    
                    await withSpan(
                        `queue_chapter_${chapter.number}`,
                        async () => {
                            return queueService.addChapterDownloadJob(
                                `Download ${chapter.title}`,
                                {
                                    seriesId,
                                    mangaTitle,
                                    chapterTitle: chapter.title,
                                    chapterNumber: chapter.number,
                                    chapterUrl: chapter.url,
                                    isPreview,
                                    scraperId: chapter.scraperId || null,
                                },
                                { jobId: `chapter-${seriesId}-${chapter.number}` }
                            );
                        },
                        { op: 'queue.add', tags: { chapter_number: chapter.number } }
                    );
                    
                    // Only increment after successfully queuing the job
                    foundCount++;
                    await setJobProgress(job, clampProgress(15 + Math.min(60, foundCount * 2)));
                } catch (jobError) {
                    logger.error(
                        `[SCANNER] Error adding job for chapter ${chapter.number}: ${jobError}`,
                        { service: 'chapterScannerService' }
                    );
                    addBreadcrumb(
                        `Failed to queue chapter ${chapter.number}`,
                        'error',
                        { error: String(jobError) }
                    );
                }
            }

            logger.info(
                `[SCANNER] Finished scanning ${mangaTitle}. Queued ${foundCount} new chapters.`
            );
            await setJobProgress(job, 80);

            Sentry.addBreadcrumb({
                message: `Chapters found during scan: ${foundCount}`,
                level: 'info',
                data: { series_id: seriesId, chapter_count: foundCount },
            });

            // Update total chapters found and transition to downloading
            if (foundCount > 0) {
                await withSpan(
                    'update_progress_total_chapters',
                    async () =>
                        mangaProgressService.setTotalChapters(
                            seriesId,
                            baseChapterCount + foundCount,
                            firstScraperId
                        ),
                    { op: 'db.write', tags: { series_id: String(seriesId) } }
                );

                // User-facing announcements (site notifications + public Discord) are NOT
                // sent here. They fire from chapterDownloaderService once the chapters
                // actually finish downloading (see notificationService
                // .announceNewlyDownloadedChapters), so users aren't notified for chapters
                // that were only queued and then failed — and recovery retries don't re-spam.
            } else {
                // No NEW chapters queued during this scan. Before marking complete, ensure
                // we are not racing an in-flight download (pending jobs) or an undercounted
                // total left by an overlapping initializeProgress.
                const pendingJobs = await queueService.countPendingChapterJobsForSeries(seriesId);
                const currentProgress = await mangaProgressService.getProgress(seriesId);

                if (pendingJobs > 0) {
                    const expectedTotal = Math.max(
                        currentProgress?.totalChapters ?? 0,
                        baseChapterCount + pendingJobs
                    );
                    logger.info(
                        `[SCANNER] Rescan for ${mangaTitle} queued nothing new but ${pendingJobs} chapter job(s) still pending; keeping downloading (expected total ${expectedTotal})`,
                        { service: 'chapterScannerService' }
                    );
                    if (currentProgress?.status === 'scanning' || currentProgress?.status === 'downloading') {
                        await mangaProgressService.setTotalChapters(seriesId, expectedTotal, firstScraperId);
                    }
                } else if (
                    currentProgress &&
                    (currentProgress.status === 'downloading' || currentProgress.status === 'scanning') &&
                    currentProgress.totalChapters > baseChapterCount
                ) {
                    // Overlapping scan found nothing, but prior import still expects more than on disk.
                    logger.info(
                        `[SCANNER] Rescan for ${mangaTitle} found no new chapters but in-flight total ${currentProgress.totalChapters} > ${baseChapterCount} on disk; leaving progress unchanged`,
                        { service: 'chapterScannerService' }
                    );
                } else if (isFirstScan) {
                    // First scan with no chapters - mark as completed with 0 total
                    await withSpan(
                        'mark_first_scan_no_chapters',
                        async () => mangaProgressService.setTotalChapters(seriesId, 0),
                        { op: 'db.write', tags: { series_id: String(seriesId) } }
                    );
                } else {
                    // Genuine idle rescan: nothing new from source, nothing pending.
                    await withSpan(
                        'mark_monitored_rescan_complete',
                        async () => mangaProgressService.markCompleted(seriesId, baseChapterCount),
                        { op: 'db.write', tags: { series_id: String(seriesId) } }
                    );
                    
                    logger.info(
                        `[SCANNER] Monitored rescan for ${mangaTitle}: no new chapters found. Series has ${baseChapterCount} chapters.`,
                        { service: 'chapterScannerService' }
                    );

                    Sentry.addBreadcrumb({
                        message: 'Monitored rescan completed with no new chapters',
                        level: 'info',
                        data: {
                            series_id: seriesId,
                            existing_chapters: baseChapterCount,
                        },
                    });
                }
            }

            if (!isRecovery) {
                await withSpan(
                    'notify_scan_completed',
                    async () =>
                        discordService.notifyScanCompleted(
                            mangaTitle,
                            seriesId,
                            foundCount,
                            isFirstScan,
                            coverUrl
                        ),
                    { op: 'notification', tags: { type: 'scan_completed' } }
                );
            }
            await setJobProgress(job, 100);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during scan';
            logger.error(
                `[SCANNER] Failed to scan ${mangaTitle}: ${errorMessage}`,
                { service: 'chapterScannerService' }
            );

            // markFailed and Sentry reporting happen in queueService after all retries are exhausted
            throw error;
        }
    }
}