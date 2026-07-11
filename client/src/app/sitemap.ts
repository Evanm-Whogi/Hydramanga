import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { absoluteUrl } from '@/lib/seo';
import { getBackendInternalUrl } from '@/lib/env';
import { authorPath } from '@/lib/paths';

type SitemapIdItem = {
  id: number;
  lastUpdatedAt: string | null;
};

type SitemapAuthorItem = {
  name: string;
  lastUpdatedAt: string | null;
};

type SitemapCursorResponse = {
  items: SitemapIdItem[];
  nextCursor: number | null;
};

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/', changeFrequency: 'hourly', priority: 1 },
  { path: '/discover', changeFrequency: 'hourly', priority: 0.8 },
  { path: '/genres', changeFrequency: 'daily', priority: 0.8 },
  { path: '/authors', changeFrequency: 'daily', priority: 0.7 },
  { path: '/lists', changeFrequency: 'daily', priority: 0.7 },
  { path: '/leaderboard', changeFrequency: 'daily', priority: 0.7 },
  { path: '/forum', changeFrequency: 'hourly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/pwa', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/community-guidelines', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/request', changeFrequency: 'monthly', priority: 0.5 },
];

async function fetchCursorPages(path: string): Promise<SitemapIdItem[]> {
  const backendUrl = getBackendInternalUrl();
  const allItems: SitemapIdItem[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: '5000' });
    if (cursor) params.set('cursor', String(cursor));

    const response = await fetch(`${backendUrl}${path}?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!response.ok) break;

    const data = (await response.json()) as SitemapCursorResponse;
    allItems.push(...data.items);

    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }

  return allItems;
}

async function fetchSitemapAuthors(): Promise<SitemapAuthorItem[]> {
  const backendUrl = getBackendInternalUrl();
  const response = await fetch(`${backendUrl}/sitemap/authors`, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = (await response.json()) as { items: SitemapAuthorItem[] };
  return data.items ?? [];
}

function mapIdEntries(items: SitemapIdItem[], pathPrefix: string, now: Date, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'], priority: number): MetadataRoute.Sitemap {
  return items.map((item) => ({
    url: absoluteUrl(`${pathPrefix}/${item.id}`),
    lastModified: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : now,
    changeFrequency,
    priority,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let mangaEntries: MetadataRoute.Sitemap = [];
  let authorEntries: MetadataRoute.Sitemap = [];
  let listEntries: MetadataRoute.Sitemap = [];
  let forumEntries: MetadataRoute.Sitemap = [];

  try {
    const [seriesItems, authorItems, listItems, forumItems] = await Promise.all([
      fetchCursorPages('/sitemap/series'),
      fetchSitemapAuthors(),
      fetchCursorPages('/sitemap/lists'),
      fetchCursorPages('/sitemap/forum'),
    ]);

    mangaEntries = mapIdEntries(seriesItems, '/manga', now, 'weekly', 0.5);
    authorEntries = authorItems.map((item) => ({
      url: absoluteUrl(authorPath(item.name)),
      lastModified: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));
    listEntries = mapIdEntries(listItems, '/lists', now, 'weekly', 0.4);
    forumEntries = mapIdEntries(forumItems, '/forum', now, 'daily', 0.4);
  } catch {
    // Keep static entries even if dynamic sitemap backends fail.
  }

  return [...staticEntries, ...mangaEntries, ...authorEntries, ...listEntries, ...forumEntries];
}

export const revalidate = 3600;
