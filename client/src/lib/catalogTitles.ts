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

function isPrimaryTitleSlot(entry: CatalogTitle): boolean {
  if (entry.language === 'en' && entry.is_primary === true) return true;
  if (entry.language === 'ja' && (entry.is_primary === true || (entry.traits?.includes('native') ?? false))) return true;
  if ((entry.language === 'ja-Latn' || entry.language === 'ja-ro') && entry.is_primary === true) return true;
  return false;
}

export function catalogTitlesToVariantList(titles: unknown): Array<{ lang: string; title: string; type?: string }> {
  return parseCatalogTitles(titles).map((entry) => ({
    lang: entry.language,
    title: entry.title,
    type: entry.traits?.[0],
  }));
}

/** Replace primary en / ja / romanized slots while keeping other title variants. */
export function applyAdminPrimaryTitleEdits(titles: unknown, edits: { english?: string; native?: string; romanized?: string }): CatalogTitle[] {
  const kept = parseCatalogTitles(titles).filter((entry) => !isPrimaryTitleSlot(entry));
  const out = [...kept];
  const english = edits.english?.trim();
  const native = edits.native?.trim();
  const romanized = edits.romanized?.trim();
  if (english) out.unshift({ language: 'en', title: english, is_primary: true, traits: [], note: null });
  if (native) out.push({ language: 'ja', title: native, is_primary: true, traits: ['native'], note: null });
  if (romanized) out.push({ language: 'ja-Latn', title: romanized, is_primary: true, traits: ['native'], note: null });
  return out;
}
