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
    private static extractSecondaryTitleStrings(secondaryTitles: unknown): string[] {
        if (!secondaryTitles) return [];

        let parsed: unknown = secondaryTitles;
        if (typeof secondaryTitles === 'string') {
            try {
                parsed = JSON.parse(secondaryTitles);
            } catch {
                parsed = secondaryTitles;
            }
        }

        const titles: string[] = [];

        const visit = (value: unknown) => {
            if (!value) return;

            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) titles.push(trimmed);
                return;
            }

            if (Array.isArray(value)) {
                for (const item of value) visit(item);
                return;
            }

            if (typeof value === 'object') {
                const record = value as Record<string, unknown>;
                if (typeof record.title === 'string') {
                    const trimmed = record.title.trim();
                    if (trimmed) titles.push(trimmed);
                    return;
                }

                for (const nested of Object.values(record)) {
                    visit(nested);
                }
            }
        };

        visit(parsed);

        const seen = new Set<string>();
        return titles.filter((title) => {
            const key = title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

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

        // Fetch cover image, native title for Discord notifications and search filtering
        const [manga] = await withSpan(
            'fetch_manga_metadata',
            async () => {
                return db
                    .select({ 
                        cover: series.cover,
                        nativeTitle: series.nativeTitle,
                        secondaryTitles: series.secondaryTitles,
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

                const secondaryTitles = this.extractSecondaryTitleStrings(manga?.secondaryTitles);

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
                        manga?.nativeTitle || undefined,
                        secondaryTitles,
                        coverUrl,
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
                                    scraperId: chapter.scraperId || null,
                                },
                                { jobId: `chapter-${seriesId}-${chapter.number}` }
                            );
                        },
                        { op: 'queue.add', tags: { chapter_number: chapter.number } }
                    );
                    
                    // Only increment after successfully queuing the job
                    foundCount++;
                    newChapters.push(chapter.number);
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
                    async () => mangaProgressService.setTotalChapters(seriesId, foundCount, firstScraperId),
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