/**
 * Manga Chapter Download Job Handler
 * Processes chapter download jobs
 */
import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { ChapterDownloaderService, ChapterDownloadData } from '@/services/chapterDownloaderService';
import logger from '@/services/loggerService';
import { withTransaction, setJobContext } from '@/utils/sentryHelper';
import { isChapterDownloadJobQueue } from '@/lib/chapterDownloadQueues';

export class MangaChapterDownloadJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return isChapterDownloadJobQueue(queueName);
  }

  async handle(data: any, job?: Job): Promise<void> {
    try {
      await withTransaction(
        `chapter_download_${data.seriesId}_${data.chapterNumber}`,
        async () => {
          setJobContext('chapter_download', {
            series_id: data.seriesId,
            manga_title: data.mangaTitle,
            chapter_number: String(data.chapterNumber),
            chapter_title: data.chapterTitle,
            is_preview: data.isPreview || false,
          });

          logger.info(`Processing chapter download: ${data.chapterTitle} from ${data.mangaTitle}`, { service: 'mangaChapterDownloadJobHandler' });
          
          const downloadData: ChapterDownloadData = {
            seriesId: data.seriesId,
            mangaTitle: data.mangaTitle,
            chapterTitle: data.chapterTitle,
            chapterNumber: data.chapterNumber,
            chapterUrl: data.chapterUrl,
            scraperId: data.scraperId || null,
          };
          
          await ChapterDownloaderService.downloadChapter(downloadData, job);
        },
        {
          op: "job.chapter_download",
          tags: {
            job_type: "chapter_download",
            series_id: String(data.seriesId),
            chapter_number: String(data.chapterNumber),
          },
        }
      );
    } catch (error) {
      logger.error(`Manga chapter download job handler failed: ${error}`, { service: 'mangaChapterDownloadJobHandler' });
      throw error;
    }
  }
}
