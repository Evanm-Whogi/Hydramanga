import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api';

export interface ScraperSearchResult {
  href: string;
  title?: string;
  score: number;
}

export interface ScraperSourceResult {
  scraperId: string;
  scraperName: string;
  results: ScraperSearchResult[];
}

/** Admin: search all scrapers for a manga (by series id, optional query override) */
export async function adminScraperSearch(mangaId: number, queryOverride?: string): Promise<{ sources: ScraperSourceResult[] }> {
  const qs = queryOverride ? `?q=${encodeURIComponent(queryOverride)}` : '';
  return apiGet(`/admin/manga/${mangaId}/scraper-search${qs}`);
}

/** Admin: set the scraper source for a series (next scan will use this source) */
export async function adminSetSource(mangaId: number, scraperId: string, scraperUrl: string): Promise<{ success: boolean; seriesId: number }> {
  return apiPatch(`/admin/manga/${mangaId}/source`, { scraperId, scraperUrl });
}

/** Admin: add a title variant to series.secondaryTitles */
export async function adminAddSecondaryTitle(mangaId: number, payload: { title: string; language?: string; type?: string }): Promise<{ success: boolean; seriesId: number; secondaryTitles: Record<string, unknown> }> {
  return apiPatch(`/admin/manga/${mangaId}/secondary-titles`, payload);
}

/** Admin: trigger a rescan (check for new chapters). Use instead of POST /manga/:id/scan for manga that already has chapters. */
export async function adminTriggerRescan(mangaId: number): Promise<{ success: boolean; seriesId: number; message: string }> {
  return apiPost(`/admin/manga/${mangaId}/rescan`);
}

/** Admin: get current scraper source, scan status, and last error. */
export async function adminGetSource(mangaId: number): Promise<{scraperId: string | null; scraperUrl: string | null; status: string | null; errorMessage: string | null; scanStatus: string; isQueued: boolean;}> {
  return apiGet(`/admin/manga/${mangaId}/source`);
}

/** Admin: clear scraper source so next scan re-searches. */
export async function adminClearSource(mangaId: number): Promise<{ success: boolean; seriesId: number; message: string }> {
  return apiDelete(`/admin/manga/${mangaId}/source`);
}

/** Admin: update series metadata. */
export async function adminUpdateSeries(mangaId: number, updates: Record<string, unknown>): Promise<{ success: boolean; seriesId: number; series: Record<string, unknown> }> {
  return apiPatch(`/admin/manga/${mangaId}`, updates);
}

/** Admin: cancel active scan, remove jobs from queues and Redis. */
export async function adminCancelScan(mangaId: number): Promise<{ success: boolean; seriesId: number; message: string; removed: { scanJobRemoved: boolean; chapterJobsRemoved: number } }> {
  return apiPost(`/admin/manga/${mangaId}/cancel-scan`);
}

/** Admin: delete chapters by IDs. Requires confirm: true. May return storageFailed if some dirs could not be removed. */
export async function adminDeleteChapters(mangaId: number, chapterIds: number[], confirm: boolean): Promise<{success: boolean; seriesId: number; deletedCount: number; storageFailed?: string[]; storageFailedCount?: number;}> {
  return apiDelete(`/admin/manga/${mangaId}/chapters`, { chapterIds, confirm });
}
