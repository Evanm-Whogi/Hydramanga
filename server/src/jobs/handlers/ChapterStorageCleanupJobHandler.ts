import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { chapterStorageService, type ChapterStorageCleanupPayload } from '@/services/chapterStorageService';
import logger from '@/services/loggerService';

export class ChapterStorageCleanupJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'storageCleanupQueue';
  }

  async handle(data: ChapterStorageCleanupPayload, job?: Job): Promise<void> {
    const failed = await chapterStorageService.processCleanupJob(data, job);
    if (failed.length > 0) {
      logger.warn(`Storage cleanup completed with ${failed.length} failure(s) for series ${data.seriesId}`, { service: 'chapterStorageCleanupJobHandler', failed });
    } else {
      logger.info(`Storage cleanup completed for series ${data.seriesId}`, { service: 'chapterStorageCleanupJobHandler' });
    }
  }
}
