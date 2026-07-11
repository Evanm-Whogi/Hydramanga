import { absoluteUrl } from '@/lib/seo';
import { getBackendInternalUrl } from '@/lib/env';
import { authorPath } from '@/lib/paths';

/** Keep each child sitemap well under Google's 50k URL / 50MB caps. */
export const AUTHORS_PER_SITEMAP = 10_000;

export type SitemapEntry = {
  url: string;
  lastModified: Date;
  changeFrequency: string;
  priority: number;
};

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

type SitemapAuthorsResponse = {
  items: SitemapAuthorItem[];
  total: number;
  nextOffset: number | null;
};

const STATIC_ROUTES: Array<{ path: string; changeFrequency: string; priority: number }> = [
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

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function toUrlsetXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastModified.toISOString();
      return `<url>
<loc>${escapeXml(entry.url)}</loc>
<lastmod>${lastmod}</lastmod>
<changefreq>${entry.changeFrequency}</changefreq>
<priority>${entry.priority}</priority>
</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function toSitemapIndexXml(locs: string[], lastmod = new Date()): string {
  const lastmodIso = lastmod.toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs
  .map(
    (loc) => `<sitemap>
<loc>${escapeXml(loc)}</loc>
<lastmod>${lastmodIso}</lastmod>
</sitemap>`,
  )
  .join('\n')}
</sitemapindex>`;
}

async function fetchCursorPages(path: string): Promise<SitemapIdItem[]> {
  const backendUrl = getBackendInternalUrl();
  const allItems: SitemapIdItem[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: '5000' });
    if (cursor) params.set('cursor', String(cursor));

    const response = await fetch(`${backendUrl}${path}?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) break;

    const data = (await response.json()) as SitemapCursorResponse;
    allItems.push(...data.items);

    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }

  return allItems;
}

export async function fetchSitemapAuthorsPage(offset: number, limit: number): Promise<SitemapAuthorsResponse> {
  const backendUrl = getBackendInternalUrl();
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  const response = await fetch(`${backendUrl}/sitemap/authors?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) return { items: [], total: 0, nextOffset: null };
  return (await response.json()) as SitemapAuthorsResponse;
}

export async function fetchAuthorSitemapTotal(): Promise<number> {
  const page = await fetchSitemapAuthorsPage(0, 1);
  return Number(page.total) || 0;
}

function mapIdEntries(items: SitemapIdItem[], pathPrefix: string, now: Date, changeFrequency: string, priority: number): SitemapEntry[] {
  return items.map((item) => ({
    url: absoluteUrl(`${pathPrefix}/${item.id}`),
    lastModified: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : now,
    changeFrequency,
    priority,
  }));
}

export async function buildCoreSitemap(): Promise<SitemapEntry[]> {
  const now = new Date();
  const staticEntries: SitemapEntry[] = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [seriesItems, listItems, forumItems] = await Promise.all([
      fetchCursorPages('/sitemap/series'),
      fetchCursorPages('/sitemap/lists'),
      fetchCursorPages('/sitemap/forum'),
    ]);

    return [
      ...staticEntries,
      ...mapIdEntries(seriesItems, '/manga', now, 'weekly', 0.5),
      ...mapIdEntries(listItems, '/lists', now, 'weekly', 0.4),
      ...mapIdEntries(forumItems, '/forum', now, 'daily', 0.4),
    ];
  } catch {
    return staticEntries;
  }
}

export async function buildAuthorSitemap(chunkIndex: number): Promise<SitemapEntry[]> {
  const now = new Date();
  const offset = chunkIndex * AUTHORS_PER_SITEMAP;
  const { items } = await fetchSitemapAuthorsPage(offset, AUTHORS_PER_SITEMAP);

  return items.map((item) => ({
    url: absoluteUrl(authorPath(item.name)),
    lastModified: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));
}

export function sitemapXmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
