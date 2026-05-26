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
