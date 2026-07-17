import type { MetadataRoute } from 'next';
import { getSiteConfig } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const site = getSiteConfig();

  return {
    rules: [
      {
        userAgent: '*',
        // Public read APIs for Googlebot's JS renderer on client-heavy pages.
        // Google uses the longest matching path; more-specific Allow beats Disallow: /api/.
        allow: [
          '/',
          '/api/home/',
          '/api/manga/',
          '/api/lists/',
          '/api/forum/',
          '/api/leaderboard/',
          '/api/users/',
          '/api/comments',
          '/api/reviews',
          '/api/analytics/trending',
          '/api/analytics/manga/',
          '/api/stickers',
          '/api/media/',
          '/api/content-images/',
          '/api/site-settings',
        ],
        disallow: [
          // App surfaces
          '/admin/',
          '/profile',
          '/history',
          '/chat',
          '/users/me',
          '/login',
          '/register',
          '/reset-password',
          '/error-500',
          '/manga/*/read/',
          '/authors',
          // Blanket API block (overridden by Allow prefixes above)
          '/api/',
          // Private API paths under otherwise-allowed prefixes (longest-match wins)
          '/api/users/me',
          '/api/users/settings',
          '/api/users/profile-picture',
          '/api/lists/mine',
          '/api/lists/saved',
          '/api/lists/search-manga',
          '/api/bookmarks/',
          '/api/chat/',
          '/api/notifications/',
          '/api/import-requests/',
          '/api/analytics/progress',
          '/api/analytics/views',
          '/api/analytics/stats',
          '/api/admin/',
          '/api/auth/',
          '/api/authors/',
        ],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
