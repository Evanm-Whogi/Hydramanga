import path from 'path';
import fs from 'fs-extra';
import logger from '@/services/loggerService';
import { appConfig } from '@/config/appConfig';

export interface ChapterStorageCleanupPayload {
  seriesId: number;
  prefixes: string[];
  deleteSeriesFolder: boolean;
}

class ChapterStorageService {
  async removeChapterStorage(storageRoot: string, seriesId: number, prefixes: string[], deleteSeriesFolder: boolean): Promise<string[]> {
    const storageFailed: string[] = [];
    if (deleteSeriesFolder) {
      const seriesDir = path.join(storageRoot, String(seriesId));
      try {
        await fs.remove(seriesDir);
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Failed to delete series storage ${seriesDir}: ${msg}`, { service: 'chapterStorageService' });
        storageFailed.push(`${seriesId}: ${msg}`);
      }
      return storageFailed;
    }

    const uniquePrefixes = [...new Set(prefixes.filter(Boolean))];
    for (const prefix of uniquePrefixes) {
      const dir = path.join(storageRoot, prefix);
      try {
        await fs.remove(dir);
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Failed to delete chapter storage ${dir}: ${msg}`, { service: 'chapterStorageService' });
        storageFailed.push(`${prefix}: ${msg}`);
      }
    }
    return storageFailed;
  }

  async processCleanupJob(payload: ChapterStorageCleanupPayload): Promise<string[]> {
    const storageRoot = appConfig.scraper?.chapterStorageRoot;
    if (!storageRoot) return [];
    return this.removeChapterStorage(storageRoot, payload.seriesId, payload.prefixes, payload.deleteSeriesFolder);
  }
}

export const chapterStorageService = new ChapterStorageService();
