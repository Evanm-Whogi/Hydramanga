import { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { chapters } from '@/db/schema';
import logger from '@/services/loggerService';
import { placeholderTrackingService } from '@/services/placeholderTrackingService';
import { objectStorageService } from '@/services/objectStorageService';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import { cacheService } from '@/services/cacheService';
import { invalidateCatalogCaches } from '@/lib/catalogCache';
import { fetchAdminExternalImageStream } from '@/lib/externalImageValidation';
import { CONTENT_LIMITS } from '@/lib/securityLimits';

/** GET /admin/placeholders — unresolved placeholder/failure ledger rows (default filter http_404). */
export const listPlaceholders = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const reasonParam = typeof req.query.reason === 'string' && req.query.reason !== 'all' ? req.query.reason : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : 100;
    const offset = req.query.offset != null ? Number(req.query.offset) : 0;
    const [pages, total] = await Promise.all([
      placeholderTrackingService.listUnresolved({ reason: reasonParam, limit: Number.isFinite(limit) ? limit : 100, offset: Number.isFinite(offset) ? offset : 0 }),
      placeholderTrackingService.countUnresolved(reasonParam),
    ]);
    return res.json({ total, reason: reasonParam ?? null, pages });
  } catch (error: any) {
    logger.error(`Failed to list placeholders: ${error.message}`, { service: 'placeholderController' });
    return next(error);
  }
};

/**
 * POST /admin/placeholders/redownload — repair a placeholdered/failed chapter: delete its
 * DB row + storage, resolve its ledger rows, and enqueue a series rescan so the chapter is
 * re-fetched from scratch. Accepts `{ storagePrefix: "seriesId/chapterNumber" }`.
 */
export const redownloadPlaceholder = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const storagePrefix = typeof req.body?.storagePrefix === 'string' ? req.body.storagePrefix.trim() : '';
    const seriesId = Number(storagePrefix.split('/')[0]);
    if (!storagePrefix.includes('/') || !Number.isFinite(seriesId) || seriesId <= 0) {
      return res.status(400).json({ error: 'storagePrefix ("seriesId/chapterNumber") is required' });
    }

    // Delete the chapter row (if present) and clean up its storage.
    const existing = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.seriesId, seriesId), eq(chapters.storagePrefix, storagePrefix)))
      .limit(1);
    if (existing.length > 0) {
      await db.delete(chapters).where(eq(chapters.id, existing[0].id));
    }
    await queueService.addJob('storageCleanupQueue', 'cleanupChapterStorage', { seriesId, prefixes: [storagePrefix], deleteSeriesFolder: false });

    // Resolve the ledger rows for this prefix — the rescan will re-record any that still fail.
    await placeholderTrackingService.resolveByPrefix(storagePrefix);

    // Rescan the series to re-download the chapter.
    await mangaOrchestratorService.enqueueSingleRescan(seriesId);

    await cacheService.invalidatePattern(`manga:${seriesId}:*`);
    await cacheService.invalidatePattern(`series:${seriesId}:*`);
    await invalidateCatalogCaches();

    logger.info(`Placeholder redownload: cleared ${storagePrefix} and enqueued rescan for series ${seriesId}`, { service: 'placeholderController' });
    return res.json({ message: `Cleared ${storagePrefix} and queued a rescan for series ${seriesId}` });
  } catch (error: any) {
    logger.error(`Failed to redownload placeholder: ${error.message}`, { service: 'placeholderController' });
    return next(error);
  }
};

/**
 * POST /admin/placeholders/replace — download an image from a custom URL and store it
 * in the failed page slot. Accepts `{ storagePrefix, pageNumber, imageUrl }`.
 */
export const replacePlaceholderPage = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const storagePrefix = typeof req.body?.storagePrefix === 'string' ? req.body.storagePrefix.trim() : '';
    const pageNumber = Number(req.body?.pageNumber);
    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
    const seriesId = Number(storagePrefix.split('/')[0]);
    if (!storagePrefix.includes('/') || !Number.isFinite(seriesId) || seriesId <= 0) {
      return res.status(400).json({ error: 'storagePrefix ("seriesId/chapterNumber") is required' });
    }
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || !Number.isInteger(pageNumber)) {
      return res.status(400).json({ error: 'pageNumber must be a positive integer' });
    }
    if (!imageUrl || imageUrl.length > CONTENT_LIMITS.contentImageUrlMaxLength) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const { stream } = await fetchAdminExternalImageStream(imageUrl);
    try {
      await objectStorageService.transformAndUploadPage(storagePrefix, pageNumber - 1, stream as Readable);
    } catch (transformErr: any) {
      return res.status(400).json({ error: transformErr?.message || 'Downloaded image could not be processed' });
    }

    await db.update(chapters).set({ updatedAt: new Date() }).where(eq(chapters.storagePrefix, storagePrefix));
    await placeholderTrackingService.resolvePage(storagePrefix, pageNumber);
    await cacheService.invalidatePattern(`manga:${seriesId}:*`);
    await cacheService.invalidatePattern(`series:${seriesId}:*`);

    logger.info(`Placeholder replace: stored page ${pageNumber} for ${storagePrefix} from custom URL`, { service: 'placeholderController' });
    return res.json({ message: `Replaced page ${pageNumber} for ${storagePrefix}` });
  } catch (error: any) {
    const message = error?.message || 'Failed to replace placeholder page';
    if (message.includes('Invalid image URL') || message.includes('not allowed') || message.includes('not point to an image') || message.includes('too large')) {
      return res.status(400).json({ error: message });
    }
    logger.error(`Failed to replace placeholder page: ${message}`, { service: 'placeholderController' });
    return next(error);
  }
};
