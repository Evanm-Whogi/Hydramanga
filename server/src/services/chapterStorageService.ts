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
