import type { Job } from 'bullmq';
import logger from '@/services/loggerService';
import { objectStorageService } from '@/services/objectStorageService';
import { progressForIndex, setJobProgress } from '@/utils/jobProgress';

export interface ChapterStorageCleanupPayload {
  seriesId: number;
  prefixes: string[];
  deleteSeriesFolder: boolean;
}

class ChapterStorageService {
  async removeChapterStorage(
    seriesId: number,
    prefixes: string[],
    deleteSeriesFolder: boolean,
    job?: Job
  ): Promise<string[]> {
    const storageFailed: string[] = [];
    if (deleteSeriesFolder) {
      await setJobProgress(job, 25);
      try {
        await objectStorageService.deleteSeries(seriesId);
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Failed to delete series storage ${seriesId}: ${msg}`, { service: 'chapterStorageService' });
        storageFailed.push(`${seriesId}: ${msg}`);
      }
      await setJobProgress(job, 95);
      return storageFailed;
    }

    const uniquePrefixes = [...new Set(prefixes.filter(Boolean))];
    for (let i = 0; i < uniquePrefixes.length; i++) {
      const prefix = uniquePrefixes[i];
      try {
        await objectStorageService.deletePrefixes([prefix]);
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Failed to delete chapter storage ${prefix}: ${msg}`, { service: 'chapterStorageService' });
        storageFailed.push(`${prefix}: ${msg}`);
      }
      await setJobProgress(job, progressForIndex(i, uniquePrefixes.length, 10, 95));
    }
    return storageFailed;
  }

  async processCleanupJob(payload: ChapterStorageCleanupPayload, job?: Job): Promise<string[]> {
    await setJobProgress(job, 5);
    const failed = await this.removeChapterStorage(
      payload.seriesId,
      payload.prefixes,
      payload.deleteSeriesFolder,
      job
    );
    await setJobProgress(job, 100);
    return failed;
  }

  async moveChapterStorage(fromPrefix: string, toPrefix: string): Promise<string | null> {
    try {
      const moved = await objectStorageService.copyPrefix(fromPrefix, toPrefix);
      if (!moved) {
        logger.warn(`Source chapter objects missing: ${fromPrefix}`, { service: 'chapterStorageService' });
        return `missing: ${fromPrefix}`;
      }
      return null;
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(`Failed to move chapter storage ${fromPrefix} → ${toPrefix}: ${msg}`, { service: 'chapterStorageService' });
      return `${fromPrefix}: ${msg}`;
    }
  }
}

export const chapterStorageService = new ChapterStorageService();
