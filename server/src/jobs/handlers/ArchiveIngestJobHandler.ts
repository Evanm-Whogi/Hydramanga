/**
 * Archive Ingest Job Handler.
 *
 * Runs `archiveIngestService.ingest` for one downloaded archive, then:
 *   - cleans up (removes the torrent + its files from the client — download-only),
 *   - serializes the follow-up scrape AFTER ingest (never concurrent, §11.3):
 *       done + ongoing series → gap-fill scrape (leading edge);
 *       needs_review / failed   → fallback scrape (safety net).
 * Low concurrency (CPU/IO heavy) — see queue config.
 */
import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { ARCHIVE_INGEST_QUEUE, type ArchiveIngestJobData } from './archiveQueueNames';
import { db } from '@/db';
import { acquisitionJobs, series } from '@/db/schema';
import { eq } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { archiveIngestService } from '@/services/archiveIngestService';
import { qbittorrentClient } from '@/archive/QbittorrentClient';
import { acquisitionRouterService } from '@/services/acquisitionRouterService';

export class ArchiveIngestJobHandler implements IJobHandler {
    canHandle(queueName: string): boolean {
        return queueName === ARCHIVE_INGEST_QUEUE;
    }

    async handle(data: ArchiveIngestJobData, _job?: Job): Promise<void> {
        const [row] = await db
            .select()
            .from(acquisitionJobs)
            .where(eq(acquisitionJobs.id, data.jobId))
            .limit(1);
        if (!row) {
            logger.warn(`[INGEST] acquisition_jobs ${data.jobId} not found`, { service: 'archiveIngestJobHandler' });
            return;
        }
        if (!row.localPath) {
            logger.warn(`[INGEST] acquisition_jobs ${data.jobId} has no localPath; cannot ingest`, {
                service: 'archiveIngestJobHandler',
            });
            return;
        }

        const result = await archiveIngestService.ingest({
            jobId: row.id,
            seriesId: row.seriesId,
            localPath: row.localPath,
            candidateTitle: row.candidateTitle,
            scrapeAfterIngest: row.scrapeAfterIngest,
            forceVolumeIngest: data.forceVolumeIngest ?? false,
        });

        // Download-only: remove the torrent to free scratch immediately. On
        // needs_review we KEEP the downloaded files — they're the dataset a human / v2
        // reviews to decide the layout (plan Q4/§9), and let us diagnose segmentation
        // without re-downloading. done/failed delete the files.
        if (row.clientHandle) {
            const deleteFiles = result.status !== 'needs_review';
            await qbittorrentClient.remove(row.clientHandle, deleteFiles).catch((err) =>
                logger.warn(`[INGEST] Failed to remove torrent ${row.clientHandle}: ${err}`, {
                    service: 'archiveIngestJobHandler',
                })
            );
            if (!deleteFiles) {
                logger.info(`[INGEST] Kept files for review at ${row.localPath}`, { service: 'archiveIngestJobHandler' });
            }
        }

        // Follow-up scrape, serialized AFTER ingest for this series.
        if (result.status === 'failed' || result.status === 'needs_review') {
            await acquisitionRouterService.enqueueScrape(row.seriesId, `${result.status}-fallback`);
            return;
        }

        // A forced volume import locks the series to archive-only (volumeSourced); a
        // gap-fill scrape would re-add real-numbered chapters that collide with the
        // volume numbering we just imported, so never scrape after it.
        if (data.forceVolumeIngest) {
            logger.info(`[INGEST] Series ${row.seriesId} forced volume import (${result.reason}); skipping follow-up scrape`, {
                service: 'archiveIngestJobHandler',
            });
            return;
        }

        // Success: ongoing series still need the leading edge scraped (archives lag).
        // A manual "archive + scrape" backfill (scrapeAfterIngest) also gap-fills even
        // for completed series — the operator wants whatever the batch missed.
        const [s] = await db.select({ status: series.status }).from(series).where(eq(series.id, row.seriesId)).limit(1);
        if ((s && s.status !== 'completed') || row.scrapeAfterIngest) {
            await acquisitionRouterService.enqueueScrape(row.seriesId, 'gap-fill');
        }

        logger.info(`[INGEST] Series ${row.seriesId} ingest ${result.status}: ${result.reason}`, {
            service: 'archiveIngestJobHandler',
        });
    }
}
