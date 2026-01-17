import { db } from '@/db'; 
import { chapters } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { scrapeWeebCentral, downloadChapterImagesStandalone } from '@/scrapers/weebCentral';
import { queueService } from '@/services/queueService';

export class MangaChapterScraperService {
    
    // Phase 1: Scan for missing chapters and queue them
    static async processSync(mangaTitle: string, seriesId: number) {
        let foundCount = 0;

        const scraper = scrapeWeebCentral(mangaTitle, async (num) => {
            const existing = await db.select().from(chapters)
                .where(and(eq(chapters.seriesId, seriesId), eq(chapters.chapterNumber, num)))
                .limit(1);
            
            const exists = existing.length > 0;
            if (exists) console.log(`[SYNC] Skipping ${num} - already exists in DB.`);
            return exists;
        });

        for await (const chapter of scraper) {
                foundCount++;
                await queueService.addJob('mangaChapterDownloadQueue', `Download ${chapter.title}`, {
                    seriesId,
                    mangaTitle,
                    chapterTitle: chapter.title,
                    chapterNumber: chapter.number,
                    chapterUrl: chapter.url
                });
            }

        console.log(`[SYNC] Finished scanning. Queued ${foundCount} new chapters.`);
    }

    // Phase 2: Perform actual download and DB insert
    static async processDownload(data: any) {
        const path = await downloadChapterImagesStandalone(data.chapterUrl, data.mangaTitle, data.chapterTitle);
        
        await db.insert(chapters).values({
            seriesId: data.seriesId,
            chapterNumber: data.chapterNumber,
            localPath: path,
            title: data.chapterTitle,
            updatedAt: new Date(),
        });
    }
}