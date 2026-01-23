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
import { scrapeWeebCentral } from '@/scrapers/weebCentral';
import { queueService } from '@/services/queueService';
import { discordService } from '@/services/discordService';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import { appConfig } from '@/config/appConfig';

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
        await mangaProgressService.initializeProgress(seriesId);

        // Fetch cover image for Discord notifications
        const [manga] = await db
            .select({ cover: series.cover })
            .from(series)
            .where(eq(series.id, seriesId));
        
        const coverUrl = manga?.cover
            ? (manga.cover as any)?.x350?.x1 ||
              (manga.cover as any)?.x250?.x1 ||
              (manga.cover as any)?.raw?.url ||
              undefined
            : undefined;

        try {
            // Start scraping
            const scraper = scrapeWeebCentral(
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

            // Process scraped chapters
            for await (const chapter of scraper) {
                foundCount++;
                newChapters.push(chapter.number);
                const isPreview = previewRemaining > 0;
                if (isPreview) previewRemaining--;
                
                await queueService.addJob(
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
            }

            logger.info(
                `[SCANNER] Finished scanning ${mangaTitle}. Queued ${foundCount} new chapters.`
            );

            // Update total chapters found and transition to downloading
            if (foundCount > 0) {
                await mangaProgressService.setTotalChapters(seriesId, foundCount);

                const chapterRange = ChapterNumberParser.formatRange(newChapters);
                await discordService.notifyChaptersAdded(
                    mangaTitle,
                    seriesId,
                    foundCount,
                    chapterRange,
                    coverUrl
                );
            } else {
                // No NEW chapters found during this scan
                if (isFirstScan) {
                    // First scan with no chapters - mark as completed with 0 total
                    await mangaProgressService.setTotalChapters(seriesId, 0);
                } else {
                    // Monitored rescan found no new chapters - mark as completed immediately
                    // Get the actual chapter count for this series for proper reporting
                    const existingChaptersCount = await db
                        .select()
                        .from(chapters)
                        .where(eq(chapters.seriesId, seriesId));
                    
                    // Mark as completed with all existing chapters already downloaded
                    await mangaProgressService.markCompleted(seriesId, existingChaptersCount.length);
                    
                    logger.info(
                        `[SCANNER] Monitored rescan for ${mangaTitle}: no new chapters found. Series has ${existingChaptersCount.length} chapters.`,
                        { service: 'chapterScannerService' }
                    );
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during scan';
            logger.error(
                `[SCANNER] Failed to scan ${mangaTitle}: ${errorMessage}`,
                { service: 'chapterScannerService' }
            );
            await mangaProgressService.markFailed(seriesId, errorMessage);
            throw error;
        }
    }
}
