import { apiGet, apiPost } from "@/lib/api";

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
  chaptersIngested: number;
  sizeBytes: number | null;
  localPath: string | null;
  hasLocalArchive: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListArchiveJobsParams {
  page?: number;
  limit?: number;
  status?: ArchiveJobStatus;
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
