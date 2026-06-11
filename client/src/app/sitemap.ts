import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

export const revalidate = 3600;