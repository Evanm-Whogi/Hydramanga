import path from 'path';
import fs from 'fs-extra';
import type { Job } from 'bullmq';
import logger from '@/services/loggerService';
import { appConfig } from '@/config/appConfig';
import { progressForIndex, setJobProgress } from '@/utils/jobProgress';

export interface ChapterStorageCleanupPayload {
  seriesId: number;
  prefixes: string[];
  deleteSeriesFolder: boolean;
}

class ChapterStorageService {
  async removeChapterStorage(
    storageRoot: string,
    seriesId: number,
    prefixes: string[],
    deleteSeriesFolder: boolean,
    job?: Job
  ): Promise<string[]> {
    const storageFailed: string[] = [];
    if (deleteSeriesFolder) {
      const seriesDir = path.join(storageRoot, String(seriesId));
      await setJobProgress(job, 25);
      try {
        await fs.remove(seriesDir);
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Failed to delete series storage ${seriesDir}: ${msg}`, { service: 'chapterStorageService' });
        storageFailed.push(`${seriesId}: ${msg}`);
      }
      await setJobProgress(job, 95);
      return storageFailed;
    }

    const uniquePrefixes = [...new Set(prefixes.filter(Boolean))];
    for (let i = 0; i < uniquePrefixes.length; i++) {
      const prefix = uniquePrefixes[i];
      const dir = path.join(storageRoot, prefix);
      try {
        await fs.remove(dir);
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Failed to delete chapter storage ${dir}: ${msg}`, { service: 'chapterStorageService' });
        storageFailed.push(`${prefix}: ${msg}`);
      }
      await setJobProgress(job, progressForIndex(i, uniquePrefixes.length, 10, 95));
    }
    return storageFailed;
  }

  async processCleanupJob(payload: ChapterStorageCleanupPayload, job?: Job): Promise<string[]> {
    const storageRoot = appConfig.scraper?.chapterStorageRoot;
    if (!storageRoot) {
      await setJobProgress(job, 100);
      return [];
    }

    await setJobProgress(job, 5);
    const failed = await this.removeChapterStorage(
      storageRoot,
      payload.seriesId,
      payload.prefixes,
      payload.deleteSeriesFolder,
      job
    );
    await setJobProgress(job, 100);
    return failed;
  }

  async moveChapterStorage(storageRoot: string, fromPrefix: string, toPrefix: string): Promise<string | null> {
    const fromDir = path.join(storageRoot, fromPrefix);
    const toDir = path.join(storageRoot, toPrefix);
    try {
      if (!(await fs.pathExists(fromDir))) {
        logger.warn(`Source chapter dir missing: ${fromDir}`, { service: 'chapterStorageService' });
        return `missing: ${fromPrefix}`;
      }
      if (await fs.pathExists(toDir)) {
        logger.warn(`Target chapter dir already exists: ${toDir}`, { service: 'chapterStorageService' });
        return `exists: ${toPrefix}`;
      }
      await fs.ensureDir(path.dirname(toDir));
      await fs.move(fromDir, toDir);
      return null;
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(`Failed to move chapter storage ${fromPrefix} → ${toPrefix}: ${msg}`, { service: 'chapterStorageService' });
      return `${fromPrefix}: ${msg}`;
    }
  }

  async removeEmptySeriesDir(storageRoot: string, seriesId: number): Promise<void> {
    const seriesDir = path.join(storageRoot, String(seriesId));
    try {
      if (await fs.pathExists(seriesDir)) {
        const entries = await fs.readdir(seriesDir);
        if (entries.length === 0) await fs.remove(seriesDir);
      }
    } catch (err) {
      logger.warn(`Failed to remove empty series dir ${seriesDir}: ${(err as Error).message}`, { service: 'chapterStorageService' });
    }
  }
}

export const chapterStorageService = new ChapterStorageService();
