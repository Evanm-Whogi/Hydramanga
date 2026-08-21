type CoverSize = { x1?: string; x2?: string; x3?: string; url?: string };

/** Pick the smallest imgproxy variant (x1) for card thumbnails. */
function pickSize(size: CoverSize | undefined): string | undefined {
    return size?.x1 || size?.x2 || size?.x3;
}

/**
 * Thumbnail URL for grid cards.
 * Prefers cdn.mangabaka.dev imgproxy sizes (x350/x250/x150) so external sources
 * (MAL, AniList, Kitsu, MangaUpdates, etc.) load resized from one CDN.
 * Falls back to raw only when no responsive tiers exist.
 */
export function getCardCoverUrl(cover: unknown): string {
    if (!cover || typeof cover !== 'object') return '/notFound.png';
    const c = cover as Record<string, CoverSize | undefined>;

    const proxied =
        pickSize(c.x350) ||
        pickSize(c.x250) ||
        pickSize(c.x150);

    if (proxied) return proxied;

    return c.raw?.url || '/notFound.png';
}

/** Wide banner URL persisted under cover.banner.url — never falls back to portrait cover. */
export function getBannerUrl(cover: unknown): string | null {
    if (!cover || typeof cover !== 'object') return null;
    const banner = (cover as { banner?: { url?: string | null; absent?: boolean } }).banner;
    if (!banner || typeof banner !== 'object') return null;
    if (banner.absent === true) return null;
    const url = banner.url;
    return typeof url === 'string' && url.length > 0 ? url : null;
}

/** Alias for wide header backgrounds. */
export function getBannerBackgroundUrl(cover: unknown): string | null {
    return getBannerUrl(cover);
}

/** Hero/header background: banner only (use gradient fallback when null). */
export function getHeroBackgroundUrl(cover: unknown): string | null {
    return getBannerBackgroundUrl(cover);
}
