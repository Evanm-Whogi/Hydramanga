import type { MetadataRoute } from 'next';
import { absoluteUrl, getSiteConfig } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  getSiteConfig();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/profile',
          '/bookmarks',
          '/history',
          '/users/me',
          '/login',
          '/register',
          '/reset-password',
          '/error-500',
          '/manga/',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: getSiteConfig().url,
  };
}