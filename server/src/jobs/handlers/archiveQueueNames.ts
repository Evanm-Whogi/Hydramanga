/**
 * Archive-pipeline queue names + job-data shapes (shared by the router, handlers,
 * and worker bootstrap).
 */
import type { AcquisitionTrigger } from '@/services/acquisitionRouterService';

export const ARCHIVE_ACQUIRE_QUEUE = 'archiveAcquireQueue';
export const ARCHIVE_INGEST_QUEUE = 'archiveIngestQueue';
export const ARCHIVE_POLL_QUEUE = 'archivePollQueue';
export const ARCHIVE_MAINTENANCE_QUEUE = 'archiveMaintenanceQueue';

/** archiveAcquireQueue: search → score → submit to the download client. */
export interface ArchiveAcquireJobData {
    seriesId: number;
    trigger: AcquisitionTrigger;
    titles: string[];
    expectedChapters?: number;
    /** Run a scraper gap-fill after a successful ingest, even for completed series. */
    scrapeAfter?: boolean;
}

/** archiveIngestQueue: unpack → segment → transcode one downloaded archive. */
export interface ArchiveIngestJobData {
    /** acquisition_jobs row id. */
    jobId: number;
    /**
     * Operator override (admin "Import volume instead"): ingest a volume-like pack
     * onto a scrape-tracked series anyway. The caller has already deleted the colliding
     * scraped chapters + their storage, so the volume-collision guard and the
     * prefix-exists skip are bypassed. Locks the series to archive-only on success.
     */
    forceVolumeIngest?: boolean;
}

/**
 * archiveMaintenanceQueue: operator cleanup that MUST run on the worker — it's the
 * only process with the scratch-disk mount and a proven path to qBittorrent (the API
 * container has neither). `purge` reconciles client + disk against the job table;
 * `removeTorrent` drops one torrent (stop seeding) and optionally its downloaded files.
 */
export type ArchiveMaintenanceJobData =
    | { action: 'purge' }
    | { action: 'removeTorrent'; handle: string; deleteFiles: boolean; localPath?: string | null };
