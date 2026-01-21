/**
 * Manga Import Job Handler
 * Processes metadata import jobs from bulk JSON files
 */
import { IJobHandler } from './IJobHandler';
import { mangaImporterService } from '@/services/mangaImporterService';
import { Job } from 'bullmq';
import logger from '@/services/loggerService';

export class MangaImportJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'mangaImportQueue';
  }

  async handle(data: any, job?: Job): Promise<void> {
    try {
      logger.info(`Processing manga import job with file: ${data.filePath}`, { service: 'mangaImportJobHandler' });
      await mangaImporterService.fullSyncManga(data.filePath, job);
    } catch (error) {
      logger.error(`Manga import job handler failed: ${error}`, { service: 'mangaImportJobHandler' });
      throw error;
    }
  }
}
