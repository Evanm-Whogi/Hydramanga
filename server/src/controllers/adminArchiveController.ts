import { Request, Response, NextFunction } from 'express';
import { db } from '@/db';
import { series, chapters, acquisitionJobs, acquisitionJobStatusEnum } from '@/db/schema';
import { eq, count, desc, and, isNull, isNotNull } from 'drizzle-orm';
import { ARCHIVE_INGEST_QUEUE, ARCHIVE_MAINTENANCE_QUEUE } from '@/jobs/handlers/archiveQueueNames';
import { acquisitionRouterService } from '@/services/acquisitionRouterService';
import { queueService } from '@/services/queueService';
import { scraperVpnRotationService } from '@/services/scraperVpnRotationService';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';
import { seriesDisplayTitleSql } from '@/lib/seriesTitleSql';

const ARCHIVE_STATUSES = acquisitionJobStatusEnum.enumValues;
type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

function isArchiveStatus(value: unknown): value is ArchiveStatus {
    return typeof value === 'string' && (ARCHIVE_STATUSES as readonly string[]).includes(value);
}

/**
 * Admin: list archive (torrent) acquisition jobs, newest first. Supports a status
 * filter and pagination, and returns per-status counts for the filter tabs plus
 * whether the pipeline is enabled at all. Powers the /admin/archive dashboard.
 */
export async function listAdminArchiveJobs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const rawPage = Number(req.query.page ?? 1);
        const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
        const rawLimit = Number(req.query.limit ?? 25);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 25;
        const offset = (page - 1) * limit;

        // A 'dismissed' filter shows soft-acknowledged jobs; every other view hides them.
        const statusParam = req.query.status;
        const dismissedView = statusParam === 'dismissed';
        const statusFilter = isArchiveStatus(statusParam) ? statusParam : undefined;
        const where = dismissedView
            ? isNotNull(acquisitionJobs.dismissedAt)
            : statusFilter
                ? and(isNull(acquisitionJobs.dismissedAt), eq(acquisitionJobs.status, statusFilter))
                : isNull(acquisitionJobs.dismissedAt);

        const [rows, [{ total }], statusGroups, [{ dismissed }]] = await Promise.all([
            db
                .select({
                    id: acquisitionJobs.id,
                    seriesId: acquisitionJobs.seriesId,
                    seriesTitle: seriesDisplayTitleSql,
                    protocol: acquisitionJobs.protocol,
                    indexer: acquisitionJobs.indexer,
                    candidateTitle: acquisitionJobs.candidateTitle,
                    status: acquisitionJobs.status,
                    progress: acquisitionJobs.progress,
                    chaptersIngested: acquisitionJobs.chaptersIngested,
                    sizeBytes: acquisitionJobs.sizeBytes,
                    localPath: acquisitionJobs.localPath,
                    clientHandle: acquisitionJobs.clientHandle,
                    error: acquisitionJobs.error,
                    dismissedAt: acquisitionJobs.dismissedAt,
                    createdAt: acquisitionJobs.createdAt,
                    updatedAt: acquisitionJobs.updatedAt,
                })
                .from(acquisitionJobs)
                .leftJoin(series, eq(series.id, acquisitionJobs.seriesId))
                .where(where)
                .orderBy(desc(acquisitionJobs.updatedAt))
                .limit(limit)
                .offset(offset),
            db.select({ total: count() }).from(acquisitionJobs).where(where),
            db
                .select({ status: acquisitionJobs.status, c: count() })
                .from(acquisitionJobs)
                .where(isNull(acquisitionJobs.dismissedAt))
                .groupBy(acquisitionJobs.status),
            db.select({ dismissed: count() }).from(acquisitionJobs).where(isNotNull(acquisitionJobs.dismissedAt)),
        ]);

        const counts: Record<string, number> = { all: 0, dismissed };
        for (const s of ARCHIVE_STATUSES) counts[s] = 0;
        for (const g of statusGroups) {
            counts[g.status] = g.c;
            counts.all += g.c;
        }

        return res.json({
            enabled: acquisitionRouterService.enabled,
            jobs: rows.map((r) => ({ ...r, hasLocalArchive: !!r.localPath })),
            counts,
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (error) {
        logger.error(`Admin list archive jobs failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: latest archive acquisition job for a single series (or null). Powers the
 * Archive tab in the manga edit modal.
 */
export async function getAdminSeriesArchiveStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid manga ID' });

        const [row] = await db
            .select({
                id: acquisitionJobs.id,
                seriesId: acquisitionJobs.seriesId,
                indexer: acquisitionJobs.indexer,
                candidateTitle: acquisitionJobs.candidateTitle,
                status: acquisitionJobs.status,
                chaptersIngested: acquisitionJobs.chaptersIngested,
                sizeBytes: acquisitionJobs.sizeBytes,
                localPath: acquisitionJobs.localPath,
                error: acquisitionJobs.error,
                createdAt: acquisitionJobs.createdAt,
                updatedAt: acquisitionJobs.updatedAt,
            })
            .from(acquisitionJobs)
            .where(eq(acquisitionJobs.seriesId, id))
            .orderBy(desc(acquisitionJobs.id))
            .limit(1);

        return res.json({
            enabled: acquisitionRouterService.enabled,
            job: row ? { ...row, hasLocalArchive: !!row.localPath } : null,
        });
    } catch (error) {
        logger.error(`Admin get series archive status failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/** Load an acquisition job by `:jobId` route param, or null. */
async function loadJob(req: Request) {
    const jobId = parseInt(req.params.jobId, 10);
    if (isNaN(jobId) || jobId <= 0) return null;
    const [row] = await db.select().from(acquisitionJobs).where(eq(acquisitionJobs.id, jobId)).limit(1);
    return row ?? null;
}

/** True when the series currently has at least one chapter row. */
async function seriesHasChapters(seriesId: number): Promise<boolean> {
    const [{ c }] = await db.select({ c: count() }).from(chapters).where(eq(chapters.seriesId, seriesId));
    return Number(c) > 0;
}

/**
 * Admin: retry an archive job. A job with a downloaded archive on disk re-ingests
 * (no re-download); otherwise it re-searches via the router (requires the pipeline
 * enabled). Only meaningful for terminal/downloaded jobs — a live search/download
 * should be abandoned, not retried.
 */
export async function retryAdminArchiveJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const job = await loadJob(req);
        if (!job) return res.status(404).json({ error: 'Archive job not found' });
        if (!['failed', 'needs_review', 'downloaded'].includes(job.status)) {
            return res.status(409).json({ error: `Cannot retry a job in '${job.status}' state` });
        }

        if (job.localPath) {
            await queueService.addJob(
                ARCHIVE_INGEST_QUEUE,
                `Retry ingest series ${job.seriesId}`,
                { jobId: job.id },
                { jobId: `reingest-${job.id}-${Date.now()}`, attempts: 1 }
            );
            return res.json({ success: true, jobId: job.id, action: 'reingest' });
        }

        if (!acquisitionRouterService.enabled) {
            return res.status(409).json({ error: 'Archive ingestion is disabled (ARCHIVE_INGEST_ENABLED=false)' });
        }
        const strategy = await acquisitionRouterService.routeImport(job.seriesId, 'manual-backfill');
        return res.json({ success: true, jobId: job.id, action: 'reacquire', strategy });
    } catch (error) {
        logger.error(`Admin retry archive job failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/** Admin: soft-acknowledge (dismiss) a job — hides it from the default list, keeps the record. */
export async function dismissAdminArchiveJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const job = await loadJob(req);
        if (!job) return res.status(404).json({ error: 'Archive job not found' });
        await db.update(acquisitionJobs).set({ dismissedAt: new Date(), updatedAt: new Date() }).where(eq(acquisitionJobs.id, job.id));
        return res.json({ success: true, jobId: job.id });
    } catch (error) {
        logger.error(`Admin dismiss archive job failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: delete an archive job row. `?deleteTorrent=true` also removes the torrent
 * from qBittorrent (stops seeding); `?deleteFiles=true` wipes its downloaded files.
 * Not gated by the pipeline-enabled flag — cleanup must work after disabling.
 */
export async function deleteAdminArchiveJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const job = await loadJob(req);
        if (!job) return res.status(404).json({ error: 'Archive job not found' });

        const deleteTorrent = req.query.deleteTorrent === 'true' || req.query.deleteTorrent === '1';
        const deleteFiles = req.query.deleteFiles === 'true' || req.query.deleteFiles === '1';
        // Torrent + scratch-file removal happens on the worker (it owns the mount +
        // qBittorrent access); enqueue before deleting the row so we keep the handle.
        let torrentRemovalQueued = false;
        if (deleteTorrent && job.clientHandle) {
            await queueService.addJob(
                ARCHIVE_MAINTENANCE_QUEUE,
                `Remove torrent ${job.clientHandle}`,
                { action: 'removeTorrent', handle: job.clientHandle, deleteFiles, localPath: job.localPath },
                { attempts: 1 }
            );
            torrentRemovalQueued = true;
        }

        await db.delete(acquisitionJobs).where(eq(acquisitionJobs.id, job.id));
        return res.json({ success: true, jobId: job.id, torrentRemovalQueued });
    } catch (error) {
        logger.error(`Admin delete archive job failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: abandon the torrent and leave the series to the scrapers. Removes the
 * torrent + files (stops seeding), marks the job failed, and enqueues a scrape only
 * if the series has no chapters yet (don't double-scrape an already-populated one).
 */
export async function abandonAdminArchiveTorrent(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const job = await loadJob(req);
        if (!job) return res.status(404).json({ error: 'Archive job not found' });

        // Stop seeding + delete the downloaded files on the worker.
        if (job.clientHandle) {
            await queueService.addJob(
                ARCHIVE_MAINTENANCE_QUEUE,
                `Abandon torrent ${job.clientHandle}`,
                { action: 'removeTorrent', handle: job.clientHandle, deleteFiles: true, localPath: job.localPath },
                { attempts: 1 }
            );
        }
        // Files are now (being) deleted; clear localPath so a later Retry re-searches
        // instead of trying to re-ingest wiped files.
        await db
            .update(acquisitionJobs)
            .set({ status: 'failed', error: 'operator-abandoned (left to scrapers)', localPath: null, updatedAt: new Date() })
            .where(eq(acquisitionJobs.id, job.id));

        let scrapeQueued = false;
        if (!(await seriesHasChapters(job.seriesId))) {
            await acquisitionRouterService.enqueueScrape(job.seriesId, 'operator-abandon');
            scrapeQueued = true;
        }
        return res.json({ success: true, jobId: job.id, scrapeQueued });
    } catch (error) {
        logger.error(`Admin abandon archive torrent failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: "delete chapters & import the volume pack instead". Enqueues a forced ingest
 * of the kept-on-disk pack; the worker deletes the existing chapters + storage ONLY
 * after the layout clears the confidence gate (so a bad pack can't strand the series
 * empty), bypasses the volume-collision guard, and locks the series to archive-only.
 */
export async function importVolumeFromArchiveJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        if (!acquisitionRouterService.enabled) {
            return res.status(409).json({ error: 'Archive ingestion is disabled (ARCHIVE_INGEST_ENABLED=false)' });
        }
        const job = await loadJob(req);
        if (!job) return res.status(404).json({ error: 'Archive job not found' });
        if (!job.localPath) {
            return res.status(409).json({ error: 'No downloaded archive on disk for this job' });
        }
        if (req.body?.confirm !== true) {
            return res.status(400).json({ error: 'confirm: true is required (this replaces existing chapters)' });
        }

        await queueService.addJob(
            ARCHIVE_INGEST_QUEUE,
            `Import volume series ${job.seriesId}`,
            { jobId: job.id, forceVolumeIngest: true },
            { jobId: `import-volume-${job.id}-${Date.now()}`, attempts: 1 }
        );
        return res.json({ success: true, jobId: job.id, seriesId: job.seriesId });
    } catch (error) {
        logger.error(`Admin import volume failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: current scraper egress status — whether the proxy is enabled and the exit
 * IP/org reported by the scraper gluetun. Powers the egress panel in the archive
 * admin. Read-only (not audited).
 */
export async function getScraperEgressStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const proxy = appConfig.scraper.proxy;
        const status = await scraperVpnRotationService.getStatus();
        return res.json({
            proxyEnabled: proxy.enabled,
            proxyUrl: proxy.url || null,
            publicIp: status.publicIp ?? null,
            provider: status.provider ?? null,
            reachable: !status.reason,
            reason: status.reason ?? null,
        });
    } catch (error) {
        logger.error(`Admin get scraper egress status failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: rotate the scraper exit IP now (stop→start the scraper gluetun). Guarded by
 * the rotation service's in-flight lock + cooldown, so a double-click rotates once.
 */
export async function rotateScraperEgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        const result = await scraperVpnRotationService.rotate('admin-manual');
        return res.json({ success: true, ...result });
    } catch (error) {
        logger.error(`Admin rotate scraper egress failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}

/**
 * Admin: reconcile qBittorrent + scratch disk against the job table (stop seeding
 * orphans + sweep stale folders). Runs on the worker — the API container has neither
 * the scratch mount nor qBittorrent access — so this enqueues and returns immediately.
 */
export async function purgeOrphanedArchiveTorrents(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
        await queueService.addJob(
            ARCHIVE_MAINTENANCE_QUEUE,
            'Purge orphaned torrents',
            { action: 'purge' },
            { jobId: 'archive-purge', attempts: 1 }
        );
        return res.json({ success: true, queued: true });
    } catch (error) {
        logger.error(`Admin purge orphaned torrents failed: ${(error as Error).message}`, { service: 'adminArchiveController' });
        return next(error);
    }
}
