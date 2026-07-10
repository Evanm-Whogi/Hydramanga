/**
 * Archive Ingest Service — archive → chapters (plan §3.3).
 *
 * Given a completed torrent download directory: unpack → segment into chapters →
 * confidence-gate → transcode pages to Garage → persist. It converges on the exact
 * same storage + persistence primitives as the scrape path, so the reader and
 * frontend need zero changes:
 *   - `objectStorageService.transformAndUploadPage` (sharp→webp→Garage)
 *   - `chapterPersistenceService.persistDownloadedChapter` (row + progress + announce)
 *
 * v1 policy: auto-ingest only HIGH-confidence chapter-structured archives; volume-only
 * or low-confidence archives are recorded `needs_review` (skip-and-log) and the series
 * stays on the scrape path. Ingest is gap-fill only (skip-if-present, Q7). JXL pages
 * are decoded out-of-process via `djxl`; if djxl is unavailable the archive routes to
 * needs_review (no silent placeholders). See plan §3.3, §5, §11.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '@/db';
import { chapters, acquisitionJobs, series } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { objectStorageService } from '@/services/objectStorageService';
import { placeholderTrackingService } from '@/services/placeholderTrackingService';
import { chapterPersistenceService } from '@/services/chapterPersistenceService';
import { mangaProgressService } from '@/services/mangaProgressService';
import { cacheService } from '@/services/cacheService';
import { invalidateCatalogCaches } from '@/lib/catalogCache';
import { isUndecodableImageError } from '@/scrapers/lib/chapterImageDownloader';
import { archiveLayoutParser, isVolumeLikeMode, type ArchiveLayoutMode, type ParsedChapterLayout } from '@/archive/ArchiveLayoutParser';
import { parseArchiveTitle } from '@/archive/lib/archiveTitleParser';
import {
    unpack,
    collectImages,
    isJxlFile,
    isDjxlAvailable,
    decodeJxlToPng,
} from '@/archive/lib/archiveUnpack';

/** Provenance value stored on `chapters.scraperId` for archive-acquired chapters. */
export const ARCHIVE_SCRAPER_ID = 'torrent';

export interface ArchiveIngestInput {
    /** acquisition_jobs row id. */
    jobId: number;
    seriesId: number;
    /** Directory the download client wrote the torrent content to (worker-visible). */
    localPath: string;
    /** Candidate torrent title (segmentation/range prior). */
    candidateTitle: string | null;
    /**
     * Whether a scraper gap-fill will run for this series after ingest (from
     * `acquisition_jobs.scrapeAfterIngest`). When true the series is scrape-tracked, so a
     * volume-like layout (whose volume numbering would collide with the scraper's real
     * chapter numbers) is routed to needs_review instead of auto-ingested.
     */
    scrapeAfterIngest: boolean;
    /**
     * Operator override ("Import volume instead"): force-ingest a volume-like pack even
     * on a scrape-tracked series. The caller deleted the colliding chapters + storage
     * first, so this bypasses the volume-collision guard and the prefix-exists skip.
     */
    forceVolumeIngest?: boolean;
}

export type ArchiveIngestStatus = 'done' | 'needs_review' | 'failed';

export interface ArchiveIngestResult {
    status: ArchiveIngestStatus;
    chaptersIngested: number;
    reason: string;
}

class ArchiveIngestService {
    private get pipeline() {
        return appConfig.archive.pipeline;
    }

    async ingest(input: ArchiveIngestInput): Promise<ArchiveIngestResult> {
        const { jobId, seriesId, localPath, candidateTitle, scrapeAfterIngest, forceVolumeIngest } = input;
        const workDir = path.join(this.pipeline.scratchDir, `ingest-${jobId}`);

        await this.setJobStatus(jobId, 'ingesting');

        try {
            const roots = await unpack(localPath, workDir);
            const images = await collectImages(roots);

            // Empty/garbage guard → failure → fallback scrape (never "0-chapter success").
            if (images.length === 0) {
                return await this.fail(jobId, 'archive contained no usable images');
            }

            const titlePrior = parseArchiveTitle(candidateTitle ?? '');
            const layout = archiveLayoutParser.parseLayout(images, titlePrior);

            // JXL fallback availability (sharp can't decode JXL).
            const hasJxl = images.some((f) => isJxlFile(f));
            if (hasJxl && !(await isDjxlAvailable())) {
                return await this.needsReview(jobId, layout, 'archive contains JPEG-XL pages but djxl is unavailable');
            }

            // Confidence gate (auto-or-skip). Both chapter- and volume-mode layouts
            // auto-ingest once they clear the threshold; a volume-only pack is now a
            // first-class success (each volume → one chapter) rather than an automatic
            // needs_review. Anything below the bar still routes to review (skip-and-log).
            if (
                layout.chapters.length === 0 ||
                layout.overallConfidence < this.pipeline.segmentationConfidenceThreshold
            ) {
                return await this.needsReview(
                    jobId,
                    layout,
                    `low confidence (${layout.overallConfidence.toFixed(2)} < ${this.pipeline.segmentationConfidenceThreshold}): ${layout.reason}`
                );
            }

            // Volume/single-mode numbers chapters by VOLUME, which collides with a
            // scraper's real chapter numbers. Only auto-ingest such a layout for
            // archive-only series (no scrape will follow); a scrape-tracked series keeps
            // the scraper authoritative and routes the pack to review (plan: mutual
            // exclusivity per series).
            if (isVolumeLikeMode(layout.mode) && scrapeAfterIngest && !forceVolumeIngest) {
                return await this.needsReview(
                    jobId,
                    layout,
                    `${layout.mode}-mode pack on a scrape-tracked series; the scraper owns real-numbered chapters (review manually): ${layout.reason}`
                );
            }

            return await this.ingestChapters(input, layout.chapters, layout.mode);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`[INGEST] Failed for series ${seriesId} (job ${jobId}): ${message}`, {
                service: 'archiveIngestService',
            });
            return await this.fail(jobId, message);
        } finally {
            await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
    }

    /**
     * Replace an operator's existing chapters with an incoming volume pack: delete the
     * chapter rows + their S3 objects (so reused `${seriesId}/${n}` prefixes are clean)
     * and invalidate caches. Runs on the worker, which owns DB + S3 access. Only called
     * once the forced ingest has cleared every gate, so it can't strand a series empty.
     */
    private async replaceExistingForVolume(seriesId: number): Promise<void> {
        await db.delete(chapters).where(eq(chapters.seriesId, seriesId));
        await objectStorageService.deleteSeries(seriesId).catch((err) =>
            logger.warn(`[INGEST] Failed to wipe storage for forced volume import of series ${seriesId}: ${err}`, {
                service: 'archiveIngestService',
            })
        );
        await cacheService.invalidatePattern(`manga:${seriesId}:*`).catch(() => {});
        await cacheService.invalidatePattern(`series:${seriesId}:*`).catch(() => {});
        await invalidateCatalogCaches().catch(() => {});
        logger.info(`[INGEST] Series ${seriesId}: cleared existing chapters for forced volume import`, {
            service: 'archiveIngestService',
        });
    }

    /** Upload + persist the auto-ingestable chapters (skip-if-present), drive progress. */
    private async ingestChapters(
        input: ArchiveIngestInput,
        layoutChapters: ParsedChapterLayout[],
        mode: ArchiveLayoutMode
    ): Promise<ArchiveIngestResult> {
        const { jobId, seriesId, forceVolumeIngest } = input;

        // Existing chapters → gap-fill only (Q7). A forced volume import instead REPLACES
        // them, so it ignores both the existing-number and prefix checks (the colliding
        // rows/objects are deleted below once we confirm the pack is non-empty).
        const existing = await db
            .select({ chapterNumber: chapters.chapterNumber })
            .from(chapters)
            .where(eq(chapters.seriesId, seriesId));
        const existingNumbers = new Set(existing.map((c) => c.chapterNumber));

        const autoChapters: ParsedChapterLayout[] = [];
        for (const ch of layoutChapters) {
            if (!forceVolumeIngest) {
                if (existingNumbers.has(ch.chapterNumber)) continue;
                // Storage-level idempotency for re-ingests where the DB row was lost.
                if (await objectStorageService.prefixExists(`${seriesId}/${ch.chapterNumber}`)) continue;
            }
            if (ch.pages.length > 0) autoChapters.push(ch);
        }

        if (autoChapters.length === 0) {
            logger.info(`[INGEST] Series ${seriesId}: all ${layoutChapters.length} chapter(s) already present; nothing to ingest`, {
                service: 'archiveIngestService',
            });
            // Nothing to import — for a forced import this leaves the series intact.
            return await this.done(jobId, 0, 'all chapters already present (gap-fill no-op)');
        }

        // Forced volume import: now that we have a non-empty pack to put in their place,
        // delete the operator's existing chapters + storage (never strands a series empty).
        if (forceVolumeIngest) await this.replaceExistingForVolume(seriesId);
        const base = forceVolumeIngest ? 0 : existing.length;

        // Progress lifecycle must mirror the scanner or incrementDownloaded no-ops (§11.1).
        await mangaProgressService.initializeProgress(seriesId, base, base);
        await mangaProgressService.setTotalChapters(seriesId, base + autoChapters.length, ARCHIVE_SCRAPER_ID);

        let ingested = 0;
        let totalPages = 0;
        for (const ch of autoChapters) {
            const storagePrefix = `${seriesId}/${ch.chapterNumber}`;
            const pageCount = await this.uploadChapterPages(storagePrefix, ch.pages);
            if (pageCount === 0) continue;
            totalPages += pageCount;

            await chapterPersistenceService.persistDownloadedChapter({
                seriesId,
                chapterNumber: ch.chapterNumber,
                volumeNumber: ch.volume ?? null,
                title: ch.title ?? `Chapter ${ch.chapterNumber}`,
                storagePrefix,
                pageCount,
                scraperId: ARCHIVE_SCRAPER_ID,
            });
            ingested++;
        }

        // Defensive: high-confidence layout but nothing actually landed → failure.
        if (totalPages === 0) {
            await mangaProgressService.markFailed(seriesId, 'Archive ingest produced no pages');
            return await this.fail(jobId, 'no pages uploaded despite passing the confidence gate');
        }

        // Lock a volume-organised series so a later scrape (status flip, manual rescan,
        // reconciliation) can never collide with the volume numbering. The scanner +
        // monitored-rescan both honour this flag (plan §2).
        if (isVolumeLikeMode(mode)) {
            await db.update(series).set({ volumeSourced: true }).where(eq(series.id, seriesId));
        }

        logger.info(`[INGEST] Series ${seriesId}: ingested ${ingested} chapter(s), ${totalPages} page(s) from archive`, {
            service: 'archiveIngestService',
        });
        return await this.done(jobId, ingested, `ingested ${ingested} chapter(s)`);
    }

    /** Transcode + upload every page of a chapter; returns pages stored. */
    private async uploadChapterPages(storagePrefix: string, pages: string[]): Promise<number> {
        // Archive sources are pristine high-res scans (lots of screentone gradient);
        // encode at higher webp quality than the scrape default to avoid block artifacts.
        const transform = { quality: this.pipeline.webpQuality, effort: this.pipeline.webpEffort };

        const uploadOne = async (i: number) => {
            const pagePath = pages[i];
            try {
                if (isJxlFile(pagePath)) {
                    const png = await decodeJxlToPng(pagePath);
                    await objectStorageService.transformAndUploadPage(storagePrefix, i, png, transform);
                } else {
                    const buffer = await fs.readFile(pagePath);
                    await objectStorageService.transformAndUploadPage(storagePrefix, i, buffer, transform);
                }
            } catch (err) {
                // A non-JXL page that isn't a decodable image (corrupt/zero-filled) →
                // placeholder, matching the scrape path's behavior. JXL/read failures
                // (no isUndecodableImageError) propagate and fail the chapter.
                if (isUndecodableImageError(err)) {
                    logger.warn(`[INGEST] Page ${i + 1} of ${storagePrefix} not decodable; storing placeholder`, {
                        service: 'archiveIngestService',
                    });
                    await objectStorageService.uploadPlaceholderSlot(storagePrefix, i);
                    await placeholderTrackingService.recordForPrefix({ storagePrefix, pageNumber: i + 1, reason: 'undecodable', errorMessage: (err as Error)?.message ?? null, scraperId: 'archive' });
                } else {
                    throw err;
                }
            }
        };

        // Transcode+upload pages in bounded parallel batches (was strictly serial). Each
        // sharp encode threads internally via libvips, so the batch overlaps CPU-heavy
        // encodes with each other and with the Garage upload round-trips. A non-recoverable
        // page rejects its promise → the batch rejects → the chapter fails (unchanged).
        const batchSize = Math.max(1, this.pipeline.transcodeBatchSize);
        for (let start = 0; start < pages.length; start += batchSize) {
            const end = Math.min(start + batchSize, pages.length);
            const batch = Array.from({ length: end - start }, (_, j) => uploadOne(start + j));
            await Promise.all(batch);
        }
        return pages.length;
    }

    // --- acquisition_jobs state transitions ---

    private async setJobStatus(jobId: number, status: 'ingesting'): Promise<void> {
        await db.update(acquisitionJobs).set({ status, updatedAt: new Date() }).where(eq(acquisitionJobs.id, jobId));
    }

    private async done(jobId: number, chaptersIngested: number, reason: string): Promise<ArchiveIngestResult> {
        await db
            .update(acquisitionJobs)
            .set({ status: 'done', chaptersIngested, error: null, updatedAt: new Date() })
            .where(eq(acquisitionJobs.id, jobId));
        return { status: 'done', chaptersIngested, reason };
    }

    private async needsReview(jobId: number, layout: unknown, reason: string): Promise<ArchiveIngestResult> {
        const sample = (layout as { samplePaths?: string[] })?.samplePaths;
        logger.warn(
            `[INGEST] Job ${jobId} → needs_review: ${reason}` +
                (sample?.length ? `\n[INGEST] sample paths:\n  ${sample.join('\n  ')}` : ''),
            { service: 'archiveIngestService' }
        );
        await db
            .update(acquisitionJobs)
            .set({ status: 'needs_review', layoutGuess: layout as object, error: reason, updatedAt: new Date() })
            .where(eq(acquisitionJobs.id, jobId));
        return { status: 'needs_review', chaptersIngested: 0, reason };
    }

    private async fail(jobId: number, reason: string): Promise<ArchiveIngestResult> {
        await db
            .update(acquisitionJobs)
            .set({ status: 'failed', error: reason, updatedAt: new Date() })
            .where(eq(acquisitionJobs.id, jobId));
        return { status: 'failed', chaptersIngested: 0, reason };
    }
}

export const archiveIngestService = new ArchiveIngestService();
export { ArchiveIngestService };
