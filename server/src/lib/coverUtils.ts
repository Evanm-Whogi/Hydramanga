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
