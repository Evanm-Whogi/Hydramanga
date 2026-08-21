type CoverSize = { url?: string; x1?: string; x2?: string; x3?: string };

function pickSize(size: CoverSize | undefined): string | null {
  if (!size || typeof size !== 'object') return null;
  return size.x1 || size.x2 || size.x3 || null;
}

/** Resolve a display URL from a series cover jsonb object (imgproxy first, then raw). */
export function resolveCoverUrl(cover: unknown): string | null {
  if (!cover || typeof cover !== 'object') return null;
  const c = cover as Record<string, CoverSize | undefined>;

  return (
    pickSize(c.x350) ||
    pickSize(c.x250) ||
    pickSize(c.x150) ||
    c.raw?.url ||
    null
  );
}

/** Wide banner URL persisted under cover.banner.url — never falls back to portrait cover. */
export function resolveBannerUrl(cover: unknown): string | null {
  if (!cover || typeof cover !== 'object') return null;
  const banner = (cover as { banner?: { url?: string | null; absent?: boolean } }).banner;
  if (!banner || typeof banner !== 'object') return null;
  if (banner.absent === true) return null;
  const url = banner.url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
