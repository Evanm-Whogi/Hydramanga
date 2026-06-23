import { apiPost } from '@/lib/api';

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
