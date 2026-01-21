/**
 * Manga Chapter Import Job Handler
 * Processes chapter discovery jobs
 */
import { IJobHandler } from './IJobHandler';
import { ChapterScannerService } from '@/services/chapterScannerService';
import logger from '@/services/loggerService';

export class MangaChapterImportJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'mangaChapterImportQueue';
  }

  async handle(data: any): Promise<void> {
    try {
      logger.info(`Processing chapter scan for manga: ${data.mangaTitle} (series ID: ${data.seriesId})`, { service: 'mangaChapterImportJobHandler' });
      await ChapterScannerService.scanForNewChapters(
        data.mangaTitle,
        data.seriesId,
        data.romanizedTitle,
        data.isFirstScan
      );
    } catch (error) {
      logger.error(`Manga chapter import job handler failed: ${error}`, { service: 'mangaChapterImportJobHandler' });
      throw error;
    }
  }
}
