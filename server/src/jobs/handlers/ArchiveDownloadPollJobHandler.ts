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

                if (status.state === 'completed' && status.outputDir) {
                    await db
                        .update(acquisitionJobs)
                        .set({ status: 'downloaded', localPath: status.outputDir, progress: 1, updatedAt: new Date() })
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
                } else if (status.state === 'error' || status.state === 'missing') {
                    await this.failAndFallback(
                        row.id,
                        row.seriesId,
                        row.clientHandle,
                        `download ${status.state}: ${status.error ?? 'unknown'}`
                    );
                } else {
                    // Still in flight. Record progress so the stall clock measures time
                    // with zero forward movement (reset whenever progress advances).
                    const progress = status.progress ?? 0;
                    const advanced = progress > (row.progress ?? 0);
                    const seeders = status.seeders ?? 0;

                    await db
                        .update(acquisitionJobs)
                        .set({
                            progress,
                            ...(advanced ? { lastProgressAt: new Date() } : {}),
                            updatedAt: new Date(),
                        })
                        .where(eq(acquisitionJobs.id, row.id));

                    // Only a genuinely DEAD SWARM is failed: state must be `stalled`
                    // (stalledDL — actively trying, no data) with no seeders and no
                    // progress past the timeout. A `queued` torrent (waiting behind others
                    // in qBittorrent's queue, or fetching metadata) and any actively
                    // `downloading` torrent are NEVER killed here — a slow/large torrent
                    // queued behind a batch must be left to finish, not fall back to scrape.
                    const stallSince = (row.lastProgressAt ?? row.createdAt).getTime();
                    const stalledMs = Date.now() - stallSince;
                    if (status.state === 'stalled' && seeders === 0 && !advanced && stalledMs > stallTimeoutMs) {
                        await this.failAndFallback(
                            row.id,
                            row.seriesId,
                            row.clientHandle,
                            `dead swarm (stalled, no seeders, no progress > ${Math.round(stallTimeoutMs / 3600000)}h)`
                        );
                    }
                    // else: queued / downloading / has seeders / advancing → wait.
                }
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
