import { apiGet, apiPost, apiDelete } from "@/lib/api";

export type ArchiveJobStatus =
  | "searching"
  | "downloading"
  | "downloaded"
  | "ingesting"
  | "done"
  | "failed"
  | "needs_review";

export interface ArchiveJob {
  id: number;
  seriesId: number;
  seriesTitle: string | null;
  protocol: string;
  indexer: string | null;
  candidateTitle: string | null;
  status: ArchiveJobStatus;
  progress?: number;
  chaptersIngested: number;
  sizeBytes: number | null;
  localPath: string | null;
  clientHandle?: string | null;
  hasLocalArchive: boolean;
  error: string | null;
  dismissedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A view filter: any real job status, "all", or "dismissed" (soft-acknowledged). */
export type ArchiveJobFilter = ArchiveJobStatus | "all" | "dismissed";

export interface ListArchiveJobsParams {
  page?: number;
  limit?: number;
  status?: ArchiveJobStatus | "dismissed";
}

export interface ListArchiveJobsResponse {
  enabled: boolean;
  jobs: ArchiveJob[];
  counts: Record<string, number>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function listArchiveJobs(params: ListArchiveJobsParams = {}): Promise<ListArchiveJobsResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiGet(`/admin/archive/jobs${query ? `?${query}` : ""}`) as Promise<ListArchiveJobsResponse>;
}

export interface SeriesArchiveStatusResponse {
  enabled: boolean;
  job: ArchiveJob | null;
}

/** Admin: latest archive acquisition job for a single series (or null). */
export async function getSeriesArchiveStatus(seriesId: number): Promise<SeriesArchiveStatusResponse> {
  return apiGet(`/admin/manga/${seriesId}/archive-status`) as Promise<SeriesArchiveStatusResponse>;
}

/** Admin: trigger an archive (torrent) import/backfill for a series. */
export async function triggerArchiveImport(seriesId: number): Promise<{ success: boolean; seriesId: number; strategy?: string; message: string }> {
  return apiPost(`/admin/manga/${seriesId}/archive-import`);
}

/** Admin: re-run ingest on the latest already-downloaded archive for a series. */
export async function reingestArchive(seriesId: number): Promise<{ success: boolean; seriesId: number; jobId?: number; message: string }> {
  return apiPost(`/admin/manga/${seriesId}/archive-reingest`);
}

// --- Per-job management (mirrors the queue-job admin actions) ---

/** Retry a job: re-ingest the downloaded files, or re-search if none on disk. */
export async function retryArchiveJob(jobId: number): Promise<{ success: boolean; action: string }> {
  return apiPost(`/admin/archive/jobs/${jobId}/retry`);
}

/** Soft-acknowledge (dismiss) a job — hides it from the default list. */
export async function dismissArchiveJob(jobId: number): Promise<{ success: boolean }> {
  return apiPost(`/admin/archive/jobs/${jobId}/dismiss`);
}

/** Delete a job row; optionally remove the torrent (stop seeding) and its files (on the worker). */
export async function deleteArchiveJob(jobId: number, opts: { deleteTorrent?: boolean; deleteFiles?: boolean } = {}): Promise<{ success: boolean; torrentRemovalQueued: boolean }> {
  const qs = new URLSearchParams();
  if (opts.deleteTorrent) qs.set("deleteTorrent", "true");
  if (opts.deleteFiles) qs.set("deleteFiles", "true");
  const query = qs.toString();
  return apiDelete(`/admin/archive/jobs/${jobId}${query ? `?${query}` : ""}`);
}

/** Abandon the torrent (stop seeding + delete files) and leave the series to scrapers. */
export async function abandonArchiveTorrent(jobId: number): Promise<{ success: boolean; scrapeQueued: boolean }> {
  return apiPost(`/admin/archive/jobs/${jobId}/abandon-torrent`);
}

/** Delete the series' scraped chapters and import the downloaded volume pack instead. */
export async function importVolumeFromArchive(jobId: number): Promise<{ success: boolean; seriesId: number }> {
  return apiPost(`/admin/archive/jobs/${jobId}/import-volume`, { confirm: true });
}

/** Queue a worker reconcile of qBittorrent + scratch disk (stop seeding orphans, sweep stale folders). */
export async function purgeOrphanedTorrents(): Promise<{ success: boolean; queued: boolean }> {
  return apiPost(`/admin/archive/orphans/purge`);
}
