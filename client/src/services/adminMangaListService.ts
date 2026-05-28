import { apiGet } from '@/lib/api';

export interface AdminMangaListItem {
  id: number;
  title: string | null;
  status: string | null;
  cover: unknown;
  lastUpdatedAt: string | null;
  chapterCount: number;
  importStatus: string | null;
  scraperId: string | null;
  errorMessage: string | null;
  importUpdatedAt: string | null;
}

export interface AdminMangaListResponse {
  manga: AdminMangaListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAdminMangaParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | 'none' | 'scanning' | 'downloading' | 'completed' | 'failed';
  scraperId?: string;
  sort?: 'updated' | 'title' | 'chapters';
}

export interface AdminMangaScraperFilterOption {
  id: string;
  name: string;
  count: number;
}

export async function listAdminManga(params: ListAdminMangaParams = {}): Promise<AdminMangaListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.scraperId && params.scraperId !== 'all') query.set('scraperId', params.scraperId);
  if (params.sort) query.set('sort', params.sort);

  const qs = query.toString();
  const data = await apiGet(`/admin/manga${qs ? `?${qs}` : ''}`);
  return {
    manga: (data as { manga: AdminMangaListItem[] }).manga ?? [],
    pagination: (data as { pagination: AdminMangaListResponse['pagination'] }).pagination,
  };
}

export async function listAdminMangaScraperFilters(): Promise<{ filters: AdminMangaScraperFilterOption[] }> {
  const data = await apiGet('/admin/manga/scraper-filters');
  return { filters: (data as { filters: AdminMangaScraperFilterOption[] }).filters ?? [] };
}

export async function fetchMangaForAdminEdit(mangaId: number): Promise<{manga: Record<string, unknown>; chapters: Array<{ id: number; chapterNumber: string; title?: string | null }>;}> {
  const data = await apiGet(`/manga/${mangaId}`);
  const manga = (data as { manga: Record<string, unknown> }).manga;
  const chapters = ((manga?.chapters as Array<Record<string, unknown>>) ?? []).map((ch) => ({
    id: Number(ch.id),
    chapterNumber: String(ch.chapterNumber ?? ''),
    title: (ch.title as string | null) ?? null,
  }));
  return { manga, chapters };
}
