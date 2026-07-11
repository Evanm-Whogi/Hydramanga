import { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { chapters, series } from '@/db/schema';
import logger from '@/services/loggerService';
import { placeholderTrackingService } from '@/services/placeholderTrackingService';
import { objectStorageService } from '@/services/objectStorageService';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import { cacheService } from '@/services/cacheService';
import { invalidateCatalogCaches } from '@/lib/catalogCache';
import { fetchAdminExternalImageStream } from '@/lib/externalImageValidation';
import { CONTENT_LIMITS } from '@/lib/securityLimits';
import { scraperManager } from '@/scrapers';
import { resolveDisplayTitle } from '@/lib/displayTitle';
import { scraperTitleOptions } from '@/lib/catalogTitles';
import { getAllChapterDownloadQueueNames } from '@/lib/chapterDownloadQueues';
import type { ScrapedChapter } from '@/scrapers/interfaces/IChapterScraper';

/** Exact string match, or equal numeric values ("100" ≈ "100.0"). */
function chapterNumbersMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function parseStoragePrefix(storagePrefix: string): { seriesId: number; chapterNumber: string } | null {
  const slash = storagePrefix.indexOf('/');
  if (slash <= 0 || slash === storagePrefix.length - 1) return null;
  const seriesId = Number(storagePrefix.slice(0, slash));
  const chapterNumber = storagePrefix.slice(slash + 1);
  if (!Number.isFinite(seriesId) || seriesId <= 0 || !chapterNumber) return null;
  return { seriesId, chapterNumber };
}

async function clearExistingChapterDownloadJob(seriesId: number, chapterNumber: string): Promise<void> {
  const jobId = `chapter-${seriesId}-${chapterNumber}`;
  for (const queueName of getAllChapterDownloadQueueNames()) {
    try {
      await queueService.removeJob(queueName, jobId, { force: true });
    } catch {
      // Job may not exist on this queue — ignore.
    }
  }
}

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

/**
 * POST /admin/placeholders/dismiss — mark ledger row(s) resolved without repairing.
 * Accepts `{ storagePrefix, pageNumber? }`. Omit pageNumber to dismiss the whole chapter prefix.
 */
export const dismissPlaceholder = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const storagePrefix = typeof req.body?.storagePrefix === 'string' ? req.body.storagePrefix.trim() : '';
    const parsed = parseStoragePrefix(storagePrefix);
    if (!parsed) {
      return res.status(400).json({ error: 'storagePrefix ("seriesId/chapterNumber") is required' });
    }

    const hasPageNumber = req.body?.pageNumber != null && req.body?.pageNumber !== '';
    if (hasPageNumber) {
      const pageNumber = Number(req.body.pageNumber);
      if (!Number.isFinite(pageNumber) || pageNumber < 0 || !Number.isInteger(pageNumber)) {
        return res.status(400).json({ error: 'pageNumber must be a non-negative integer' });
      }
      await placeholderTrackingService.resolvePage(storagePrefix, pageNumber);
      logger.info(`Placeholder dismiss: resolved ${storagePrefix}#${pageNumber}`, { service: 'placeholderController' });
      return res.json({ message: `Dismissed page ${pageNumber} for ${storagePrefix}` });
    }

    await placeholderTrackingService.resolveByPrefix(storagePrefix);
    logger.info(`Placeholder dismiss: resolved all pages for ${storagePrefix}`, { service: 'placeholderController' });
    return res.json({ message: `Dismissed all unresolved pages for ${storagePrefix}` });
  } catch (error: any) {
    logger.error(`Failed to dismiss placeholder: ${error.message}`, { service: 'placeholderController' });
    return next(error);
  }
};

/**
 * POST /admin/placeholders/download-from — delete the chapter and re-download it from an
 * alternate scraper match. Does NOT change the series scraper pin.
 * Accepts `{ storagePrefix, scraperId, scraperUrl }`.
 */
export const downloadFromPlaceholder = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const storagePrefix = typeof req.body?.storagePrefix === 'string' ? req.body.storagePrefix.trim() : '';
    const scraperId = typeof req.body?.scraperId === 'string' ? req.body.scraperId.trim() : '';
    const scraperUrl = typeof req.body?.scraperUrl === 'string' ? req.body.scraperUrl.trim() : '';
    const parsed = parseStoragePrefix(storagePrefix);
    if (!parsed) {
      return res.status(400).json({ error: 'storagePrefix ("seriesId/chapterNumber") is required' });
    }
    if (!scraperId || !scraperUrl) {
      return res.status(400).json({ error: 'scraperId and scraperUrl are required' });
    }

    const resolvedScraper = scraperManager.getScraperById(scraperId);
    if (!resolvedScraper) {
      return res.status(400).json({ error: `Unknown scraper "${scraperId}"` });
    }
    if (!resolvedScraper.getMetadata().enabled) {
      return res.status(400).json({ error: `Scraper "${scraperId}" is disabled` });
    }

    const { seriesId } = parsed;
    const [existingChapter] = await db
      .select({ id: chapters.id, chapterNumber: chapters.chapterNumber })
      .from(chapters)
      .where(and(eq(chapters.seriesId, seriesId), eq(chapters.storagePrefix, storagePrefix)))
      .limit(1);
    const chapterNumber = existingChapter?.chapterNumber ?? parsed.chapterNumber;

    const [seriesRow] = await db
      .select({ titles: series.titles })
      .from(series)
      .where(eq(series.id, seriesId))
      .limit(1);
    if (!seriesRow) return res.status(404).json({ error: 'Manga not found' });

    const mangaName = resolveDisplayTitle(seriesRow);
    if (!mangaName) return res.status(400).json({ error: 'Series has no title' });
    const titleOpts = scraperTitleOptions(seriesRow.titles);

    // Locate the chapter on the alternate source without touching the series pin
    // (scrapeChapters only persists a pin when it runs findBestMatch).
    let matched: ScrapedChapter | null = null;
    for await (const chapter of scraperManager.scrapeChapters(
      mangaName,
      async (num) => !chapterNumbersMatch(num, chapterNumber),
      seriesId,
      titleOpts.romanizedTitle,
      titleOpts.nativeTitle,
      titleOpts.secondaryTitles.length > 0 ? titleOpts.secondaryTitles : undefined,
      undefined,
      scraperUrl,
      scraperId,
    )) {
      if (chapterNumbersMatch(chapter.number, chapterNumber)) {
        matched = chapter;
        break;
      }
    }

    if (!matched?.url) {
      return res.status(404).json({ error: `Chapter ${chapterNumber} not found on ${scraperId}` });
    }

    if (existingChapter) {
      await db.delete(chapters).where(eq(chapters.id, existingChapter.id));
    }
    await queueService.addJob('storageCleanupQueue', 'cleanupChapterStorage', { seriesId, prefixes: [storagePrefix], deleteSeriesFolder: false });
    await placeholderTrackingService.resolveByPrefix(storagePrefix);
    await clearExistingChapterDownloadJob(seriesId, chapterNumber);

    // Keep our chapterNumber so storage prefix / DB identity stay stable; only the
    // chapter URL + job scraperId come from the alternate source.
    await queueService.addChapterDownloadJob(
      `Download ${matched.title}`,
      {
        seriesId,
        mangaTitle: mangaName,
        chapterTitle: matched.title,
        chapterNumber,
        chapterUrl: matched.url,
        scraperId: matched.scraperId || scraperId,
      },
      { jobId: `chapter-${seriesId}-${chapterNumber}` },
    );

    await cacheService.invalidatePattern(`manga:${seriesId}:*`);
    await cacheService.invalidatePattern(`series:${seriesId}:*`);
    await invalidateCatalogCaches();

    logger.info(
      `Placeholder download-from: queued chapter ${chapterNumber} for series ${seriesId} from ${scraperId} (pin unchanged)`,
      { service: 'placeholderController' },
    );
    return res.json({
      message: `Queued chapter ${chapterNumber} from ${scraperId} (series pin unchanged)`,
      seriesId,
      chapterNumber,
      scraperId: matched.scraperId || scraperId,
      chapterUrl: matched.url,
    });
  } catch (error: any) {
    logger.error(`Failed to download placeholder from alternate scraper: ${error.message}`, { service: 'placeholderController' });
    return next(error);
  }
};
