/**
 * Archive Acquire Job Handler.
 *
 * Query Prowlarr → score/gate → pick the best candidate → submit to the download
 * client (behind the VPN guard) → write an `acquisition_jobs` row (downloading) and
 * return immediately. The long torrent download is advanced by the poller, never by
 * holding this worker. On no candidate / submit failure → fall back to scrape.
 */
import type { Job } from 'bullmq';
import crypto from 'crypto';
import { IJobHandler } from './IJobHandler';
import { ARCHIVE_ACQUIRE_QUEUE, type ArchiveAcquireJobData } from './archiveQueueNames';
import { db } from '@/db';
import { acquisitionJobs } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { prowlarrIndexerService } from '@/archive/ProwlarrIndexerService';
import { archiveCandidateScorer } from '@/archive/ArchiveCandidateScorer';
import { qbittorrentClient } from '@/archive/QbittorrentClient';
import { acquisitionRouterService } from '@/services/acquisitionRouterService';

function candidateHash(downloadUri: string, infoHash?: string): string {
    if (infoHash) return infoHash.toLowerCase();
    return crypto.createHash('sha256').update(downloadUri).digest('hex').slice(0, 40);
}

export class ArchiveAcquireJobHandler implements IJobHandler {
    canHandle(queueName: string): boolean {
        return queueName === ARCHIVE_ACQUIRE_QUEUE;
    }

    async handle(data: ArchiveAcquireJobData, _job?: Job): Promise<void> {
        const { seriesId, titles, expectedChapters, scrapeAfter } = data;
        logger.info(`[ACQUIRE] Searching archives for series ${seriesId} ("${titles[0] ?? '?'}")`, {
            service: 'archiveAcquireJobHandler',
        });

        const candidates = await prowlarrIndexerService.search(
            { query: titles[0] ?? '', altTitles: titles.slice(1), seriesId },
            50
        );
        const ranked = archiveCandidateScorer.scoreAll(candidates, { titles, expectedChapters });
        archiveCandidateScorer.logRanking(seriesId, ranked);
        const best = ranked.find((r) => r.rejectedReason === null) ?? null;

        if (!best) {
            logger.warn(`[ACQUIRE] No suitable archive for series ${seriesId}; falling back to scrape`, {
                service: 'archiveAcquireJobHandler',
            });
            await acquisitionRouterService.enqueueScrape(seriesId, 'no-candidate-fallback');
            return;
        }

        const c = best.candidate;
        const hash = candidateHash(c.downloadUri, c.infoHash);

        // Upsert the acquisition row (dedupe by seriesId+candidateHash).
        const [row] = await db
            .insert(acquisitionJobs)
            .values({
                seriesId,
                protocol: 'torrent',
                indexer: c.indexer,
                candidateTitle: c.title,
                candidateHash: hash,
                downloadUri: c.downloadUri,
                status: 'searching',
                sizeBytes: c.sizeBytes,
                scrapeAfterIngest: scrapeAfter ?? false,
            })
            .onConflictDoUpdate({
                target: [acquisitionJobs.seriesId, acquisitionJobs.candidateHash],
                // Repeat the partial-index predicate so Postgres matches the partial
                // unique index (idx_acquisition_jobs_series_candidate WHERE hash NOT NULL).
                targetWhere: sql`${acquisitionJobs.candidateHash} is not null`,
                set: { status: 'searching', candidateTitle: c.title, scrapeAfterIngest: scrapeAfter ?? false, updatedAt: new Date() },
            })
            .returning({ id: acquisitionJobs.id });

        try {
            const handle = await qbittorrentClient.submit(c);
            await db
                .update(acquisitionJobs)
                .set({ status: 'downloading', clientHandle: handle, updatedAt: new Date() })
                .where(eq(acquisitionJobs.id, row.id));
            logger.info(`[ACQUIRE] Series ${seriesId}: submitted "${c.title.slice(0, 60)}" (job ${row.id}, handle ${handle})`, {
                service: 'archiveAcquireJobHandler',
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`[ACQUIRE] Submit failed for series ${seriesId}: ${message}; falling back to scrape`, {
                service: 'archiveAcquireJobHandler',
            });
            await db
                .update(acquisitionJobs)
                .set({ status: 'failed', error: message, updatedAt: new Date() })
                .where(eq(acquisitionJobs.id, row.id));
            await acquisitionRouterService.enqueueScrape(seriesId, 'submit-failed-fallback');
        }
    }
}
