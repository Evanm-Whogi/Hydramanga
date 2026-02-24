import { apiGet, apiPatch, apiPost } from '@/lib/api';

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
