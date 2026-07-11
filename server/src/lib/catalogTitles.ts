export type CatalogTitle = {
  language: string;
  traits?: string[];
  title: string;
  note?: string | null;
  is_primary?: boolean;
};

export function parseCatalogTitles(titles: unknown): CatalogTitle[] {
  if (!titles) return [];
  let parsed: unknown = titles;
  if (typeof titles === 'string') {
    try {
      parsed = JSON.parse(titles);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is CatalogTitle => {
    return Boolean(entry && typeof entry === 'object' && typeof (entry as CatalogTitle).title === 'string');
  });
}

function pickTitle(entries: CatalogTitle[], predicate: (entry: CatalogTitle) => boolean): string | null {
  const match = entries.find(predicate);
  const trimmed = match?.title?.trim();
  return trimmed || null;
}

export function resolveEnglishTitle(titles: unknown): string | null {
  const entries = parseCatalogTitles(titles);
  return pickTitle(entries, (e) => e.language === 'en' && e.is_primary === true)
    ?? pickTitle(entries, (e) => e.language === 'en' && (e.traits?.includes('official') ?? false))
    ?? pickTitle(entries, (e) => e.language === 'en')
    ?? pickTitle(entries, (e) => e.is_primary === true)
    ?? entries[0]?.title?.trim()
    ?? null;
}

export function resolveNativeTitle(titles: unknown): string | null {
  const entries = parseCatalogTitles(titles);
  return pickTitle(entries, (e) => e.language === 'ja' && (e.is_primary === true || (e.traits?.includes('native') ?? false)))
    ?? pickTitle(entries, (e) => e.language === 'ja')
    ?? null;
}

export function resolveRomanizedTitle(titles: unknown): string | null {
  const entries = parseCatalogTitles(titles);
  return pickTitle(entries, (e) => (e.language === 'ja-Latn' || e.language === 'ja-ro') && e.is_primary === true)
    ?? pickTitle(entries, (e) => e.language === 'ja-Latn' || e.language === 'ja-ro')
    ?? null;
}

/** All unique title strings from the catalog titles array (search / scraper matching). */
export function extractCatalogTitleStrings(titles: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of parseCatalogTitles(titles)) {
    const trimmed = entry.title.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function scraperTitleOptions(titles: unknown): { romanizedTitle?: string; nativeTitle?: string; secondaryTitles: string[] } {
  const all = extractCatalogTitleStrings(titles);
  const display = resolveEnglishTitle(titles) ?? resolveNativeTitle(titles) ?? resolveRomanizedTitle(titles);
  const secondaryTitles = display ? all.filter((t) => t.toLowerCase() !== display.toLowerCase()) : all;
  return {
    romanizedTitle: resolveRomanizedTitle(titles) ?? undefined,
    nativeTitle: resolveNativeTitle(titles) ?? undefined,
    secondaryTitles,
  };
}

/** Append a manual title variant to the catalog titles array. */
export function appendCatalogTitle(titles: unknown, input: { title: string; language?: string; type?: string }): CatalogTitle[] {
  const entries = [...parseCatalogTitles(titles)];
  const language = (input.language || 'en').trim() || 'en';
  const traits = input.type?.trim() ? [input.type.trim()] : [];
  const title = input.title.trim();
  if (!title) return entries;
  const exists = entries.some((e) => e.language === language && e.title.toLowerCase() === title.toLowerCase());
  if (exists) return entries;
  entries.push({ language, title, traits, note: null, is_primary: false });
  return entries;
}
