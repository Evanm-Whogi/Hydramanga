import { db } from '@/db'; 
import { chapters, series } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { scrapeWeebCentral, downloadChapterImagesStandalone } from '@/scrapers/weebCentral';
import { queueService } from '@/services/queueService';
import { discordService } from '@/services/discordService';
import { mangaProgressService } from '@/services/mangaProgressService';
import logger from '@/services/loggerService';
import { appConfig } from '@/config/appConfig';

export class MangaChapterScraperService {
    
    // Scan for missing chapters and queue them
    static async processSync(mangaTitle: string, seriesId: number, romanizedTitle?: string, isFirstScan = false) {
        let foundCount = 0;
        const newChapters: string[] = [];
        let previewRemaining = isFirstScan ? appConfig.queues.mangaChapterDownloadQueue.previewCount : 0;

        // Initialize progress tracking
        await mangaProgressService.initializeProgress(seriesId);

        // Fetch cover image for Discord notifications
        const [manga] = await db.select({ cover: series.cover }).from(series).where(eq(series.id, seriesId));
        const coverUrl = manga?.cover ? (manga.cover as any)?.x350?.x1 || (manga.cover as any)?.x250?.x1 || (manga.cover as any)?.raw?.url || undefined : undefined;

        try {
            // Start scraping
            const scraper = scrapeWeebCentral(mangaTitle, async (num) => {
                const existing = await db.select().from(chapters).where(and(eq(chapters.seriesId, seriesId), eq(chapters.chapterNumber, num))).limit(1);
                const exists = existing.length > 0;
                if (exists) logger.info(`[SYNC] Skipping ${num} - already exists in DB.`);
                return exists;
            }, seriesId, romanizedTitle, coverUrl);

            // Process scraped chapters
            for await (const chapter of scraper) {
                foundCount++;
                newChapters.push(chapter.number);
                const isPreview = previewRemaining > 0;
                if (isPreview) previewRemaining--;
                await queueService.addJob('mangaChapterDownloadQueue', `Download ${chapter.title}`, {
                    seriesId,
                    mangaTitle,
                    chapterTitle: chapter.title,
                    chapterNumber: chapter.number,
                    chapterUrl: chapter.url,
                    isPreview,
                }, { jobId: `chapter-${seriesId}-${chapter.number}` });
            }

            logger.info(`[SYNC] Finished scanning. Queued ${foundCount} new chapters.`);
            
            // Update total chapters found and transition to downloading
            if (foundCount > 0) {
                await mangaProgressService.setTotalChapters(seriesId, foundCount);
                
                const chapterRange = this.formatChapterRange(newChapters);
                await discordService.notifyChaptersAdded(mangaTitle, seriesId, foundCount, chapterRange, coverUrl);
            } else {
                // No chapters found - mark as completed
                await mangaProgressService.setTotalChapters(seriesId, 0);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during scan';
            logger.error(`[SYNC] Failed to scan ${mangaTitle}: ${errorMessage}`, { service: 'mangaChapterService' });
            await mangaProgressService.markFailed(seriesId, errorMessage);
            throw error;
        }
    }

    // Perform actual download and DB insert
    static async processDownload(data: any) {
        try {
            const downloadResult = await downloadChapterImagesStandalone(data.chapterUrl, data.mangaTitle, data.chapterTitle);
            const localPath = downloadResult.path;
            const pageCount = downloadResult.pageCount;
            
            await db.insert(chapters).values({
                seriesId: data.seriesId,
                chapterNumber: data.chapterNumber,
                localPath,
                pageCount,
                title: data.chapterTitle,
                updatedAt: new Date(),
            }).onConflictDoUpdate({
                target: [chapters.seriesId, chapters.chapterNumber],
                set: {
                    localPath,
                    pageCount,
                    title: data.chapterTitle,
                    updatedAt: new Date(),
                }
            });

            logger.info(`Saved chapter ${data.chapterNumber} for series ${data.seriesId} at ${localPath}`, { service: 'mangaChapterService' });
            
            // Increment downloaded count for progress tracking
            await mangaProgressService.incrementDownloaded(data.seriesId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during download';
            logger.error(`Failed to download chapter ${data.chapterNumber} for series ${data.seriesId}: ${errorMessage}`, { service: 'mangaChapterService' });
            // Don't mark as failed here - let BullMQ retry, only mark failed after all attempts exhausted
            throw error;
        }
    }
    
    // Helper to format chapter ranges for Discord notifications
    private static formatChapterRange(chapters: string[]): string {
        if (chapters.length === 0) return '';
        if (chapters.length === 1) return chapters[0];
        
        const sorted = [...chapters].map(c => parseFloat(c)).sort((a, b) => a - b);
        const ranges: string[] = [];
        let start = sorted[0];
        let end = sorted[0];
        
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === end + 1 || Math.abs(sorted[i] - (end + 0.1)) < 0.01) {
                end = sorted[i];
            } else {
                ranges.push(start === end ? start.toString() : `${start}-${end}`);
                start = end = sorted[i];
            }
        }
        ranges.push(start === end ? start.toString() : `${start}-${end}`);
        
        return ranges.join(', ');
    }
}