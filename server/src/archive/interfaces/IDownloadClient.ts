/**
 * Download-client abstraction for the archive pipeline. The acquire job submits a
 * candidate and returns immediately with a handle; a poller later queries status
 * and, on completion, hands the output directory to the ingest stage. The torrent
 * download itself is long-running and stateful in the external client — never
 * blocking a BullMQ worker. (Usenet `SabnzbdClient` deferred.)
 */
import type { ArchiveCandidate } from './types';

export type DownloadState =
    | 'queued'
    | 'downloading'
    | 'completed'
    | 'stalled'
    | 'error'
    | 'missing';

export interface DownloadStatus {
    state: DownloadState;
    /** 0..1 download progress. */
    progress: number;
    /** Absolute path (as the worker sees it) to the downloaded content, when complete. */
    outputDir?: string;
    name?: string;
    sizeBytes?: number;
    seeders?: number;
    error?: string;
}

export interface IDownloadClient {
    /** Stable id, e.g. `'qbittorrent'`. */
    readonly id: string;
    /**
     * Submit a candidate for download. Returns a client handle (infohash) that the
     * poller uses to query status. Implementations MUST verify VPN protection first
     * when required (see `vpnGuardService`).
     */
    submit(candidate: ArchiveCandidate): Promise<string>;
    /** Current status of a previously-submitted handle. */
    status(handle: string): Promise<DownloadStatus>;
    /** Remove a torrent (and optionally its files) from the client. */
    remove(handle: string, deleteFiles: boolean): Promise<void>;
}
