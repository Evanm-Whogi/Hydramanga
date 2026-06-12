import type { Metadata } from 'next';

const DEFAULT_NAME = 'HydraManga';
const DEFAULT_SLOGAN = 'Unleash your next Obsession.';
const DEFAULT_DESCRIPTION = 'HydraManga is a dynamic, community-driven platform where readers can discover, track, review, and discuss manga, manhua, manhwa, and more in one seamless ecosystem. Built for passionate fans HydraManga blends a powerful reading experience with rich social features, profiles, clubs, discussions, recommendations, and personalized libraries, so every user feels part of a thriving community. HydraManga gives you total control over how you discover and read. Earn badges, climb the leaderboards, and join a community that never sleeps. Are you ready to read?';
const DEFAULT_URL = 'https://hydramanga.com';

export const SITE_KEYWORDS = [
  'manga',
  'manhwa',
  'manhua',
  'webtoon',
  'comics',
  'hentai',
  'community',
  'manga reader',
  'read manga online',
  'manga tracker',
  'manga community',
  'manga reviews',
  'manga discovery',
  'anime',
  'HydraManga',
];

export function normalizeCanonicalOrigin(rawUrl: string): string {
  return rawUrl.replace(/\/$/, '').replace(/^(https?:\/\/)www\./i, '$1');
}

export function getSiteConfig() {
  const url = normalizeCanonicalOrigin(process.env.NEXT_PUBLIC_URL || DEFAULT_URL);
  return {
    name: process.env.NEXT_PUBLIC_NAME || DEFAULT_NAME,
    slogan: process.env.NEXT_PUBLIC_SLOGAN || DEFAULT_SLOGAN,
    description: process.env.NEXT_PUBLIC_DESC || DEFAULT_DESCRIPTION,
    url,
  };
}

export function getMetadataBase(): URL {
  return new URL(getSiteConfig().url);
}

export function getDefaultOgImagePath(): string {
  return '/pwa/android/launchericon-512x512.png';
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const { url } = getSiteConfig();
  return `${url}${path.startsWith('/') ? path : `/${path}`}`;
}

type PageMetadataOptions = {
  title?: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
  ogType?: 'website' | 'article';
  images?: string | Array<{ url: string; alt?: string; width?: number; height?: number }>;
  /** When true, title is not wrapped with the root `%s | SiteName` template. Use on the homepage. */
  absoluteTitle?: boolean;
  /** When false, omit the global brand keywords meta tag (reduces SERP cannibalization on manga pages). */
  includeSiteKeywords?: boolean;
};

function normalizeImages(images?: PageMetadataOptions['images']) {
  const { name } = getSiteConfig();
  const fallback = [{ url: absoluteUrl(getDefaultOgImagePath()), width: 512, height: 512, alt: name }];
  if (!images) return fallback;
  if (typeof images === 'string') {
    return [{ url: absoluteUrl(images), alt: name }];
  }
  return images.map((image) => ({
    ...image,
    url: absoluteUrl(image.url),
  }));
}

export function buildPageMetadata(options: PageMetadataOptions = {}): Metadata {
  const site = getSiteConfig();
  const titleText = options.title ?? `${site.name} - ${site.slogan}`;
  const description = options.description ?? site.description;
  const canonical = options.path ? absoluteUrl(options.path) : site.url;
  const ogImages = normalizeImages(options.images);
  const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const includeSiteKeywords = options.includeSiteKeywords ?? true;
  const title = options.absoluteTitle ? { absolute: titleText } : titleText;

  return {
    title,
    description,
    ...(includeSiteKeywords ? { keywords: SITE_KEYWORDS } : {}),
    metadataBase: getMetadataBase(),
    alternates: { canonical },
    openGraph: {
      title: titleText,
      description,
      url: canonical,
      siteName: site.name,
      locale: 'en_US',
      type: options.ogType ?? 'website',
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: titleText,
      description,
      images: ogImages.map((image) => image.url),
    },
    robots: options.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  };
}

export function buildRootMetadata(): Metadata {
  const site = getSiteConfig();
  const defaultTitle = `${site.name} - ${site.slogan}`;
  const ogImages = normalizeImages();

  return {
    ...buildPageMetadata({ title: defaultTitle, description: site.description, path: '/', absoluteTitle: true }),
    title: {
      default: defaultTitle,
      template: `%s | ${site.name}`,
    },
    authors: [{ name: site.name }],
    creator: site.name,
    publisher: site.name,
    category: 'entertainment',
    appleWebApp: {
      capable: true,
      title: site.name,
      statusBarStyle: 'black-translucent',
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: [
        { url: '/pwa/ios/180.png', sizes: '180x180', type: 'image/png' },
        { url: '/pwa/ios/152.png', sizes: '152x152', type: 'image/png' },
        { url: '/pwa/ios/120.png', sizes: '120x120', type: 'image/png' },
      ],
    },
    manifest: '/manifest.json',
    openGraph: {
      title: defaultTitle,
      description: site.description,
      url: site.url,
      siteName: site.name,
      locale: 'en_US',
      type: 'website',
      images: ogImages,
    },
  };
}

export function buildOrganizationJsonLd() {
  const site = getSiteConfig();
  return {
    '@type': 'Organization',
    '@id': `${site.url}/#organization`,
    name: site.name,
    description: site.description,
    url: site.url,
    logo: absoluteUrl(getDefaultOgImagePath()),
  };
}

export function buildWebsiteJsonLd() {
  const site = getSiteConfig();
  const organization = buildOrganizationJsonLd();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        name: site.name,
        description: site.description,
        url: site.url,
        publisher: { '@id': organization['@id'] },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${site.url}/discover?search={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

export function buildHomePageJsonLd() {
  const site = getSiteConfig();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${site.url}/#webpage`,
    name: `${site.name} - ${site.slogan}`,
    description: site.description,
    url: site.url,
    isPartOf: { '@id': `${site.url}/#website` },
    about: { '@id': `${site.url}/#organization` },
    primaryImageOfPage: absoluteUrl(getDefaultOgImagePath()),
  };
}

export function buildComicSeriesJsonLd(manga: { title: string; description?: string | null; coverUrl?: string; id: number }) {
  const site = getSiteConfig();
  return {
    '@context': 'https://schema.org',
    '@type': 'ComicSeries',
    name: manga.title,
    description: manga.description || `Read ${manga.title} on ${site.name}`,
    url: absoluteUrl(`/manga/${manga.id}`),
    isPartOf: { '@id': `${site.url}/#website` },
    publisher: { '@id': `${site.url}/#organization` },
    ...(manga.coverUrl ? { image: manga.coverUrl } : {}),
  };
}

export function truncateDescription(text: string | null | undefined, maxLength = 160): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}