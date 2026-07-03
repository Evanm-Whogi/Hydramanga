import { apiGet, apiPost } from '@/lib/api';

export type TriggerRankedScanParams = {
  start: number;
  end: number;
  skipWithChapters?: boolean;
  autoSelectSource?: boolean;
  useArchive?: boolean;
  type?: string;
};

export type TriggerRankedScanResponse = {
  message: string;
  description: string;
  start: number;
  end: number;
  skipWithChapters: boolean;
  autoSelectSource: boolean;
  useArchive: boolean;
  type: string;
};

export async function triggerRankedScan(params: TriggerRankedScanParams): Promise<TriggerRankedScanResponse> {
  const search = new URLSearchParams({
    start: String(params.start),
    end: String(params.end),
  });
  if (params.skipWithChapters) search.set('skipWithChapters', 'true');
  if (params.autoSelectSource === false) search.set('autoSelectSource', 'false');
  if (params.useArchive === false) search.set('useArchive', 'false');
  if (params.type && params.type !== 'all') search.set('type', params.type);
  return apiPost(`/admin/manga/scan-ranked?${search.toString()}`, {}) as Promise<TriggerRankedScanResponse>;
}

export type CatalogScanStats = {
  queued: number;
  archived: number;
  skippedIgnored: number;
  skippedWithChapters: number;
  sourcesSelected: number;
  sourcesAlreadySet: number;
  sourcesNotFound: number;
  sourcesLowScore: number;
  batchesCompleted: number;
};

export type CatalogScanState = {
  status: 'idle' | 'running' | 'stopping' | 'completed';
  nextRank: number;
  batchSize: number;
  type: string | null;
  skipWithChapters: boolean;
  autoSelectSource: boolean;
  useArchive: boolean;
  currentBatchStart: number | null;
  currentBatchEnd: number | null;
  currentBatchSeriesIds: number[];
  currentBatchArchivedIds: number[];
  totalCatalogCount: number;
  stats: CatalogScanStats;
  progressPercent: number;
  currentBatchCompleted: number;
  currentBatchTotal: number;
  startedAt: string | null;
  stoppedAt: string | null;
  updatedAt: string;
};

export type CatalogScanStartParams = {
  batchSize?: number;
  type?: string;
  skipWithChapters?: boolean;
  autoSelectSource?: boolean;
  useArchive?: boolean;
  resume?: boolean;
};

export async function getCatalogScanState(): Promise<CatalogScanState> {
  const res = await apiGet('/admin/manga/catalog-scan') as { state: CatalogScanState };
  return res.state;
}

export async function startCatalogScan(params: CatalogScanStartParams): Promise<{ message: string; state: CatalogScanState }> {
  return apiPost('/admin/manga/catalog-scan/start', params) as Promise<{ message: string; state: CatalogScanState }>;
}

export async function stopCatalogScan(): Promise<{ message: string; state: CatalogScanState }> {
  return apiPost('/admin/manga/catalog-scan/stop', {}) as Promise<{ message: string; state: CatalogScanState }>;
}

export async function forceStopCatalogScan(): Promise<{ message: string; state: CatalogScanState }> {
  return apiPost('/admin/manga/catalog-scan/force-stop', {}) as Promise<{ message: string; state: CatalogScanState }>;
}

export async function resetCatalogScan(): Promise<{ message: string; state: CatalogScanState }> {
  return apiPost('/admin/manga/catalog-scan/reset', {}) as Promise<{ message: string; state: CatalogScanState }>;
}
