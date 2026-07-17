import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { getBackendInternalUrl } from '@/lib/env';

// Request-time only — Docker image builds cannot reach the API, so ISR prerender
// would bake an empty manga list into the sitemap.
export const dynamic = 'force-dynamic';

type SitemapSeriesItem = {
  id: number;
  lastUpdatedAt: string | null;
};

const STATIC_PATHS: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/discover', changeFrequency: 'daily', priority: 0.9 },
  { path: '/genres', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/lists', changeFrequency: 'daily', priority: 0.7 },
  { path: '/forum', changeFrequency: 'daily', priority: 0.6 },
  { path: '/leaderboard', changeFrequency: 'daily', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/community-guidelines', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/pwa', changeFrequency: 'monthly', priority: 0.3 },
];

async function fetchSitemapSeries(): Promise<SitemapSeriesItem[]> {
  try {
    const res = await fetch(`${getBackendInternalUrl()}/manga/sitemap`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SitemapSeriesItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency,
    priority,
  }));

  const series = await fetchSitemapSeries();
  const mangaEntries: MetadataRoute.Sitemap = series.map((item) => ({
    url: absoluteUrl(`/manga/${item.id}`),
    lastModified: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...mangaEntries];
}
