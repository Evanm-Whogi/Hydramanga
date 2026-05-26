/** Resolve a display URL from a series cover jsonb object. */
export function resolveCoverUrl(cover: unknown): string | null {
  if (!cover || typeof cover !== 'object') return null;
  const c = cover as Record<string, { url?: string; x1?: string; x2?: string; x3?: string } | string | undefined>;
  const raw = c.raw;
  if (raw && typeof raw === 'object' && raw.url) return raw.url;
  const x350 = c.x350;
  if (x350 && typeof x350 === 'object') {
    return x350.x3 || x350.x2 || x350.x1 || null;
  }
  const x250 = c.x250;
  if (x250 && typeof x250 === 'object') {
    return x250.x1 || null;
  }
  return null;
}
