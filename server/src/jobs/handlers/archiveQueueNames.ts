/**
 * Archive-pipeline queue names + job-data shapes (shared by the router, handlers,
 * and worker bootstrap).
 */
import type { AcquisitionTrigger } from '@/services/acquisitionRouterService';

export const ARCHIVE_ACQUIRE_QUEUE = 'archiveAcquireQueue';
export const ARCHIVE_INGEST_QUEUE = 'archiveIngestQueue';
export const ARCHIVE_POLL_QUEUE = 'archivePollQueue';

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
}
