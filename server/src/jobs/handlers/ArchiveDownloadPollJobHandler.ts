/**
 * Archive Download Poll Job Handler.
 *
 * Fired on an interval by a BullMQ repeatable job (NOT node-cron — the worker's
 * node-cron init is independent and may be disabled). For each `downloading`
 * acquisition row it asks the client for status and advances state:
 *   - completed → record outputDir, status=downloaded, enqueue archiveIngestQueue
 *   - error / missing / stalled-past-timeout → fail, remove torrent, fallback to scrape
 *   - still downloading → leave for the next tick
 */
import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { ARCHIVE_POLL_QUEUE, ARCHIVE_INGEST_QUEUE, type ArchiveIngestJobData } from './archiveQueueNames';
import { db } from '@/db';
import { acquisitionJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { queueService } from '@/services/queueService';
import { qbittorrentClient } from '@/archive/QbittorrentClient';
import { acquisitionRouterService } from '@/services/acquisitionRouterService';

export class ArchiveDownloadPollJobHandler implements IJobHandler {
    canHandle(queueName: string): boolean {
        return queueName === ARCHIVE_POLL_QUEUE;
    }

    async handle(_data: unknown, _job?: Job): Promise<void> {
        const rows = await db.select().from(acquisitionJobs).where(eq(acquisitionJobs.status, 'downloading'));
        if (rows.length === 0) return;

        const stallTimeoutMs = appConfig.archive.pipeline.downloadStallTimeoutMs;
        logger.debug(`[POLL] Checking ${rows.length} downloading acquisition job(s)`, {
            service: 'archiveDownloadPollJobHandler',
        });

        for (const row of rows) {
            if (!row.clientHandle) continue;
            try {
                const status = await qbittorrentClient.status(row.clientHandle);
                const ageMs = Date.now() - row.createdAt.getTime();

                if (status.state === 'completed' && status.outputDir) {
                    await db
                        .update(acquisitionJobs)
                        .set({ status: 'downloaded', localPath: status.outputDir, updatedAt: new Date() })
                        .where(eq(acquisitionJobs.id, row.id));
                    await queueService.addJob(
                        ARCHIVE_INGEST_QUEUE,
                        `Archive ingest series ${row.seriesId}`,
                        { jobId: row.id } as ArchiveIngestJobData,
                        { jobId: `ingest-${row.id}`, attempts: 1 }
                    );
                    logger.info(`[POLL] Series ${row.seriesId}: download complete → enqueued ingest (job ${row.id})`, {
                        service: 'archiveDownloadPollJobHandler',
                    });
                } else if (
                    status.state === 'error' ||
                    status.state === 'missing' ||
                    (status.state === 'stalled' && ageMs > stallTimeoutMs)
                ) {
                    const reason =
                        status.state === 'stalled'
                            ? `dead swarm (stalled > ${Math.round(stallTimeoutMs / 3600000)}h)`
                            : `download ${status.state}: ${status.error ?? 'unknown'}`;
                    await this.failAndFallback(row.id, row.seriesId, row.clientHandle, reason);
                }
                // else: queued/downloading → wait for the next tick.
            } catch (err) {
                logger.warn(`[POLL] Status check failed for job ${row.id} (series ${row.seriesId}): ${err}`, {
                    service: 'archiveDownloadPollJobHandler',
                });
            }
        }
    }

    private async failAndFallback(jobId: number, seriesId: number, handle: string, reason: string): Promise<void> {
        logger.warn(`[POLL] Series ${seriesId}: ${reason}; failing job ${jobId} → fallback scrape`, {
            service: 'archiveDownloadPollJobHandler',
        });
        await db
            .update(acquisitionJobs)
            .set({ status: 'failed', error: reason, updatedAt: new Date() })
            .where(eq(acquisitionJobs.id, jobId));
        await qbittorrentClient.remove(handle, true).catch(() => {});
        await acquisitionRouterService.enqueueScrape(seriesId, 'download-failed-fallback');
    }
}
