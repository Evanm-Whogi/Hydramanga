import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { getBackendInternalUrl } from '@/lib/env';

type SitemapSeriesItem = {
  id: number;
  lastUpdatedAt: string | null;
};

type SitemapSeriesResponse = {
  items: SitemapSeriesItem[];
  nextCursor: number | null;
};

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/', changeFrequency: 'hourly', priority: 1 },
  { path: '/discover', changeFrequency: 'hourly', priority: 0.8 },
  { path: '/collections', changeFrequency: 'daily', priority: 0.8 },
  { path: '/leaderboard', changeFrequency: 'daily', priority: 0.7 },
  { path: '/board', changeFrequency: 'hourly', priority: 0.7 },
  { path: '/announcements', changeFrequency: 'daily', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/community-guidelines', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/request', changeFrequency: 'monthly', priority: 0.5 },
];

async function fetchAllSeriesIds(): Promise<SitemapSeriesItem[]> {
  const backendUrl = getBackendInternalUrl();
  const allItems: SitemapSeriesItem[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: '5000' });
    if (cursor) params.set('cursor', String(cursor));

    const response = await fetch(`${backendUrl}/sitemap/series?${params.toString()}`, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) break;

    const data = (await response.json()) as SitemapSeriesResponse;
    allItems.push(...data.items);

    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }

  return allItems;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let mangaEntries: MetadataRoute.Sitemap = [];
  try {
    const seriesItems = await fetchAllSeriesIds();
    mangaEntries = seriesItems.map((item) => ({
      url: absoluteUrl(`/manga/${item.id}`),
      lastModified: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
  } catch {
    mangaEntries = [];
  }

  return [...staticEntries, ...mangaEntries];
}

export const revalidate = 3600;
