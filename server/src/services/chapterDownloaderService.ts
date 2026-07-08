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

import type { Job } from 'bullmq';
import { scraperManager } from '@/scrapers';
import { chapterPersistenceService } from '@/services/chapterPersistenceService';
import logger from '@/services/loggerService';
import * as Sentry from "@sentry/node";
import { withSpan } from '@/utils/sentryHelper';
import { formatDbError, getPgErrorDetails } from '@/utils/dbError';
import { setJobProgress } from '@/utils/jobProgress';

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
    static async downloadChapter(data: ChapterDownloadData, job?: Job): Promise<void> {
        const chapterNumberStr = String(data.chapterNumber);

        try {
            await setJobProgress(job, 5);
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
                        data.chapterTitle,
                        data.scraperId
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
            await setJobProgress(job, 80);

            Sentry.addBreadcrumb({
                message: 'Chapter downloaded to storage',
                level: 'info',
                data: { storagePrefix, page_count: pageCount },
            });

            // Persist the chapter, drive progress, and announce on completion. Shared
            // with the archive/torrent path so both produce identical rows + notifications.
            await withSpan(
                'persist_downloaded_chapter',
                async () =>
                    chapterPersistenceService.persistDownloadedChapter({
                        seriesId: data.seriesId,
                        chapterNumber: chapterNumberStr,
                        title: data.chapterTitle,
                        storagePrefix,
                        pageCount,
                        scraperId: data.scraperId || null,
                    }),
                {
                    op: 'db.upsert',
                    tags: {
                        series_id: String(data.seriesId),
                        chapter_number: chapterNumberStr,
                    },
                }
            );

            await setJobProgress(job, 100);
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
            logger.error(
                `[DOWNLOADER] Failed to download chapter ${data.chapterNumber} for series ${data.seriesId}: ${formatDbError(error)}`,
                {
                    service: 'chapterDownloaderService',
                    pg_error: getPgErrorDetails(error),
                }
            );

            // NOTE: Do NOT mark as failed or report to Sentry here. queueService.onFailed() handles both
            // after all retry attempts are exhausted.
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
