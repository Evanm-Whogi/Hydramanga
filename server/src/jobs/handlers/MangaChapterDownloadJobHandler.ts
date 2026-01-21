/**
 * Manga Chapter Download Job Handler
 * Processes chapter download jobs
 */
import { IJobHandler } from './IJobHandler';
import { ChapterDownloaderService, ChapterDownloadData } from '@/services/chapterDownloaderService';
import logger from '@/services/loggerService';

export class MangaChapterDownloadJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'mangaChapterDownloadQueue';
  }

  async handle(data: any): Promise<void> {
    try {
      logger.info(`Processing chapter download: ${data.chapterTitle} from ${data.mangaTitle}`, { service: 'mangaChapterDownloadJobHandler' });
      const downloadData: ChapterDownloadData = {
        seriesId: data.seriesId,
        mangaTitle: data.mangaTitle,
        chapterTitle: data.chapterTitle,
        chapterNumber: data.chapterNumber,
        chapterUrl: data.chapterUrl,
      };
      await ChapterDownloaderService.downloadChapter(downloadData);
    } catch (error) {
      logger.error(`Manga chapter download job handler failed: ${error}`, { service: 'mangaChapterDownloadJobHandler' });
      throw error;
    }
  }
}
