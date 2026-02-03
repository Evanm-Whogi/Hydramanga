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

import { db } from '@/db';
import { chapters, series } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { scraperManager } from '@/scrapers';
import { queueService } from '@/services/queueService';
import { discordService } from '@/services/discordService';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';
import * as Sentry from "@sentry/node";
import { withSpan, addBreadcrumb, captureError } from '@/utils/sentryHelper';

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
        isFirstScan = false
    ): Promise<void> {
        let foundCount = 0;
        const newChapters: string[] = [];
        let previewRemaining = isFirstScan ? appConfig.queues.mangaChapterDownloadQueue.previewCount : 0;

        // Initialize progress tracking
        await withSpan(
            'initialize_progress_tracking',
            async () => mangaProgressService.initializeProgress(seriesId),
            { op: 'db.write', tags: { series_id: String(seriesId) } }
        );

        // Fetch cover image for Discord notifications
        const [manga] = await withSpan(
            'fetch_manga_cover',
            async () => {
                return db
                    .select({ cover: series.cover })
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
                        romanizedTitle,
                        coverUrl
                    );
                },
                { op: 'scraper.init', tags: { series_id: String(seriesId) } }
            );

            // Process scraped chapters
            for await (const chapter of scraper) {
                try {
                    foundCount++;
                    newChapters.push(chapter.number);
                    const isPreview = previewRemaining > 0;
                    if (isPreview) previewRemaining--;
                    
                    await withSpan(
                        `queue_chapter_${chapter.number}`,
                        async () => {
                            return queueService.addJob(
                                'mangaChapterDownloadQueue',
                                `Download ${chapter.title}`,
                                {
                                    seriesId,
                                    mangaTitle,
                                    chapterTitle: chapter.title,
                                    chapterNumber: chapter.number,
                                    chapterUrl: chapter.url,
                                    isPreview,
                                },
                                { jobId: `chapter-${seriesId}-${chapter.number}` }
                            );
                        },
                        { op: 'queue.add', tags: { chapter_number: chapter.number } }
                    );
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

            Sentry.addBreadcrumb({
                message: `Chapters found during scan: ${foundCount}`,
                level: 'info',
                data: { series_id: seriesId, chapter_count: foundCount },
            });

            // Update total chapters found and transition to downloading
            if (foundCount > 0) {
                await withSpan(
                    'update_progress_total_chapters',
                    async () => mangaProgressService.setTotalChapters(seriesId, foundCount),
                    { op: 'db.write', tags: { series_id: String(seriesId) } }
                );

                const chapterRange = ChapterNumberParser.formatRange(newChapters);
                await withSpan(
                    'notify_chapters_added',
                    async () => {
                        return discordService.notifyChaptersAdded(
                            mangaTitle,
                            seriesId,
                            foundCount,
                            chapterRange,
                            coverUrl
                        );
                    },
                    { op: 'notification', tags: { type: 'chapters_added' } }
                );
            } else {
                // No NEW chapters found during this scan
                if (isFirstScan) {
                    // First scan with no chapters - mark as completed with 0 total
                    await withSpan(
                        'mark_first_scan_no_chapters',
                        async () => mangaProgressService.setTotalChapters(seriesId, 0),
                        { op: 'db.write', tags: { series_id: String(seriesId) } }
                    );
                } else {
                    // Monitored rescan found no new chapters - mark as completed immediately
                    // Get the actual chapter count for this series for proper reporting
                    const existingChaptersCount = await withSpan(
                        'fetch_existing_chapters_count',
                        async () => {
                            return db
                                .select()
                                .from(chapters)
                                .where(eq(chapters.seriesId, seriesId));
                        },
                        { op: 'db.read', tags: { series_id: String(seriesId) } }
                    );
                    
                    // Mark as completed with all existing chapters already downloaded
                    await withSpan(
                        'mark_monitored_rescan_complete',
                        async () => mangaProgressService.markCompleted(seriesId, existingChaptersCount.length),
                        { op: 'db.write', tags: { series_id: String(seriesId) } }
                    );
                    
                    logger.info(
                        `[SCANNER] Monitored rescan for ${mangaTitle}: no new chapters found. Series has ${existingChaptersCount.length} chapters.`,
                        { service: 'chapterScannerService' }
                    );

                    Sentry.addBreadcrumb({
                        message: 'Monitored rescan completed with no new chapters',
                        level: 'info',
                        data: {
                            series_id: seriesId,
                            existing_chapters: existingChaptersCount.length,
                        },
                    });
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during scan';
            logger.error(
                `[SCANNER] Failed to scan ${mangaTitle}: ${errorMessage}`,
                { service: 'chapterScannerService' }
            );

            await withSpan(
                'mark_scan_failed',
                async () => mangaProgressService.markFailed(seriesId, errorMessage),
                { op: 'db.write', tags: { series_id: String(seriesId) } }
            ).catch((markErr) => {
                logger.error(`Failed to mark scan as failed: ${markErr}`, { service: 'chapterScannerService' });
            });

            captureError(error, {
                tags: {
                    process: 'chapter_scan',
                    series_id: String(seriesId),
                },
                data: {
                    manga_title: mangaTitle,
                    chapters_found: foundCount,
                    is_first_scan: isFirstScan,
                },
            });

            throw error;
        }
    }
}
