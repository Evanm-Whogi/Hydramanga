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
import { downloadChapterImagesStandalone } from '@/scrapers/weebCentral';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';

export interface ChapterDownloadData {
    seriesId: number;
    mangaTitle: string;
    chapterTitle: string;
    chapterNumber: number | string;
    chapterUrl: string;
}

export class ChapterDownloaderService {
    /**
     * Download a single chapter's images and store metadata
     * @param data - Chapter download data containing URL and metadata
     */
    static async downloadChapter(data: ChapterDownloadData): Promise<void> {
        try {
            logger.info(
                `[DOWNLOADER] Starting download for chapter ${data.chapterNumber} of "${data.mangaTitle}"`,
                { service: 'chapterDownloaderService' }
            );

            // Download images and get local storage path
            const localPath = await downloadChapterImagesStandalone(
                data.chapterUrl,
                data.mangaTitle,
                data.chapterTitle
            );

            // Convert chapterNumber to string (database expects text)
            const chapterNumberStr = String(data.chapterNumber);

            // Upsert chapter in database
            await db
                .insert(chapters)
                .values({
                    seriesId: data.seriesId,
                    chapterNumber: chapterNumberStr,
                    localPath,
                    title: data.chapterTitle,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [chapters.seriesId, chapters.chapterNumber],
                    set: {
                        localPath,
                        title: data.chapterTitle,
                        updatedAt: new Date(),
                    },
                });

            logger.info(
                `[DOWNLOADER] Successfully saved chapter ${data.chapterNumber} for series ${data.seriesId} at ${localPath}`,
                { service: 'chapterDownloaderService' }
            );

            // Increment downloaded count for progress tracking
            await mangaProgressService.incrementDownloaded(data.seriesId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during download';
            logger.error(
                `[DOWNLOADER] Failed to download chapter ${data.chapterNumber} for series ${data.seriesId}: ${errorMessage}`,
                { service: 'chapterDownloaderService' }
            );

            // Mark the import as failed so frontend stops waiting and surfaces error
            await mangaProgressService.markFailed(
                data.seriesId,
                `Chapter ${data.chapterNumber} failed: ${errorMessage}`
            );
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
