/**
 * Chapter Downloader Service
 * Handles chapter image downloading and storage
 * Responsibilities:
 * - Download chapter images from sources
 * - Store chapters locally
 * - Update database with chapter metadata
 * - Track download progress
 * - Handle download errors
 */

import { db } from '@/db';
import { chapters } from '@/db/schema';
import { scraperManager } from '@/scrapers';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { eq, and } from 'drizzle-orm';
import * as Sentry from "@sentry/node";
import { withSpan, addBreadcrumb, captureError } from '@/utils/sentryHelper';

export interface ChapterDownloadData {
    seriesId: number;
    mangaTitle: string;
    chapterTitle: string;
    chapterNumber: number | string;
    chapterUrl: string;
    scraperId?: string | null; // ID of the scraper that found this chapter
}

export class ChapterDownloaderService {
    /**
     * Download a single chapter's images and store metadata
     * @param data - Chapter download data containing URL and metadata
     */
    static async downloadChapter(data: ChapterDownloadData): Promise<void> {
        const chapterNumberStr = String(data.chapterNumber);

        try {
            logger.info(
                `[DOWNLOADER] Starting download for chapter ${data.chapterNumber} of "${data.mangaTitle}"`,
                { service: 'chapterDownloaderService' }
            );

            Sentry.addBreadcrumb({
                message: 'Chapter download started',
                level: 'info',
                data: {
                    series_id: data.seriesId,
                    chapter_number: chapterNumberStr,
                    manga_title: data.mangaTitle,
                },
            });

            // Download images and get storage prefix using scraper manager with fallback
            const downloadResult = await withSpan(
                'scraper_download_chapter',
                async () => {
                    return scraperManager.downloadChapter(
                        data.chapterUrl,
                        data.seriesId,
                        chapterNumberStr,
                        data.mangaTitle,
                        data.chapterTitle
                    );
                },
                {
                    op: 'scraper.download',
                    tags: {
                        series_id: String(data.seriesId),
                        chapter_number: chapterNumberStr,
                    },
                }
            );

            const storagePrefix = downloadResult.storagePrefix;
            const pageCount = downloadResult.pageCount;

            Sentry.addBreadcrumb({
                message: 'Chapter downloaded to storage',
                level: 'info',
                data: { storagePrefix, page_count: pageCount },
            });

            // Upsert chapter in database
            await withSpan(
                'upsert_chapter_metadata',
                async () => {
                    return db
                        .insert(chapters)
                        .values({
                            seriesId: data.seriesId,
                            chapterNumber: chapterNumberStr,
                            storagePrefix,
                            pageCount,
                            title: data.chapterTitle,
                            scraperId: data.scraperId || null,
                            updatedAt: new Date(),
                        })
                        .onConflictDoUpdate({
                            target: [chapters.seriesId, chapters.chapterNumber],
                            set: {
                                storagePrefix,
                                pageCount,
                                title: data.chapterTitle,
                                scraperId: data.scraperId || null,
                                updatedAt: new Date(),
                            },
                        });
                },
                {
                    op: 'db.upsert',
                    tags: {
                        series_id: String(data.seriesId),
                        chapter_number: chapterNumberStr,
                    },
                }
            );

            logger.info(
                `[DOWNLOADER] Successfully saved chapter ${data.chapterNumber} for series ${data.seriesId} with prefix ${storagePrefix}`,
                { service: 'chapterDownloaderService' }
            );

            // Fetch the complete chapter object from database
            const [savedChapter] = await withSpan(
                'fetch_saved_chapter',
                async () => {
                    return db
                        .select()
                        .from(chapters)
                        .where(and(eq(chapters.chapterNumber, chapterNumberStr), eq(chapters.seriesId, data.seriesId)))
                        .limit(1);
                },
                {
                    op: 'db.read',
                    tags: {
                        series_id: String(data.seriesId),
                        chapter_number: chapterNumberStr,
                    },
                }
            );

            // Increment downloaded count for progress tracking with complete chapter info
            if (savedChapter) {
                await withSpan(
                    'update_progress_tracking',
                    async () => {
                        return mangaProgressService.incrementDownloaded(data.seriesId, {
                            id: savedChapter.id,
                            chapterNumber: savedChapter.chapterNumber,
                            title: savedChapter.title || data.chapterTitle,
                            pageCount: savedChapter.pageCount || pageCount,
                            createdAt: savedChapter.createdAt?.toISOString(),
                            updatedAt: savedChapter.updatedAt?.toISOString(),
                        });
                    },
                    {
                        op: 'db.write',
                        tags: {
                            series_id: String(data.seriesId),
                            chapter_number: chapterNumberStr,
                        },
                    }
                );
            } else {
                // Fallback if fetch fails
                await withSpan(
                    'update_progress_tracking_fallback',
                    async () => {
                        return mangaProgressService.incrementDownloaded(data.seriesId, {
                            chapterNumber: chapterNumberStr,
                            title: data.chapterTitle,
                            pageCount,
                        });
                    },
                    {
                        op: 'db.write',
                        tags: {
                            series_id: String(data.seriesId),
                            chapter_number: chapterNumberStr,
                        },
                    }
                );
            }

            Sentry.addBreadcrumb({
                message: 'Chapter download completed successfully',
                level: 'info',
                data: {
                    series_id: data.seriesId,
                    chapter_number: chapterNumberStr,
                    page_count: pageCount,
                },
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during download';
            logger.error(
                `[DOWNLOADER] Failed to download chapter ${data.chapterNumber} for series ${data.seriesId}: ${errorMessage}`,
                { service: 'chapterDownloaderService' }
            );

            captureError(error, {
                tags: {
                    process: 'chapter_download',
                    series_id: String(data.seriesId),
                    chapter_number: chapterNumberStr,
                },
                data: {
                    manga_title: data.mangaTitle,
                    chapter_title: data.chapterTitle,
                    url: data.chapterUrl,
                },
            });

            // NOTE: Do NOT mark as failed here. Let the queue service handle it after all retry attempts exhausted.
            // Marking failed on every error prevents retries and causes state machine errors.
            // The queueService.onFailed() handler will call markFailed() after max attempts reached.
            throw error;
        }
    }

    /**
     * Download multiple chapters in sequence
     * @param chaptersData - Array of chapter download data
     * @returns Object with success and failure counts
     */
    static async downloadChapters(
        chaptersData: ChapterDownloadData[]
    ): Promise<{ successful: number; failed: number }> {
        let successful = 0;
        let failed = 0;

        for (const data of chaptersData) {
            try {
                await this.downloadChapter(data);
                successful++;
            } catch (error) {
                failed++;
                logger.warn(
                    `[DOWNLOADER] Continuing after chapter download failure. Progress: ${successful}/${chaptersData.length}`,
                    { service: 'chapterDownloaderService' }
                );
            }
        }

        return { successful, failed };
    }
}
