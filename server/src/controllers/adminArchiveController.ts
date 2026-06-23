import { Request, Response, NextFunction } from 'express';
import { db } from '@/db';
import { series, acquisitionJobs, acquisitionJobStatusEnum } from '@/db/schema';
import { eq, count, desc } from 'drizzle-orm';
import { acquisitionRouterService } from '@/services/acquisitionRouterService';
import logger from '@/services/loggerService';

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

        const statusParam = req.query.status;
        const statusFilter = isArchiveStatus(statusParam) ? statusParam : undefined;
        const where = statusFilter ? eq(acquisitionJobs.status, statusFilter) : undefined;

        const [rows, [{ total }], statusGroups] = await Promise.all([
            db
                .select({
                    id: acquisitionJobs.id,
                    seriesId: acquisitionJobs.seriesId,
                    seriesTitle: series.title,
                    protocol: acquisitionJobs.protocol,
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
                .leftJoin(series, eq(series.id, acquisitionJobs.seriesId))
                .where(where)
                .orderBy(desc(acquisitionJobs.updatedAt))
                .limit(limit)
                .offset(offset),
            db.select({ total: count() }).from(acquisitionJobs).where(where),
            db
                .select({ status: acquisitionJobs.status, c: count() })
                .from(acquisitionJobs)
                .groupBy(acquisitionJobs.status),
        ]);

        const counts: Record<string, number> = { all: 0 };
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
