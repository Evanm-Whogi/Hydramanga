import { extractCatalogTitleStrings, resolveEnglishTitle, resolveNativeTitle, resolveRomanizedTitle } from '@/lib/catalogTitles';

const UNKNOWN_TITLE_RE = /^unknown title(?:\s*\(please report on discord\))?/i;

export type SeriesTitleFields = {
  titles?: unknown;
  /** Resolved at read time for API responses; not stored in DB. */
  title?: string | null;
};

export function isUnknownPlaceholderTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim();
  if (!trimmed) return false;
  return UNKNOWN_TITLE_RE.test(trimmed);
}

/** Prefer English primary from catalog titles, then native → romanized → other variants. */
export function resolveDisplayTitle(fields: SeriesTitleFields): string {
  const candidates = [
    resolveEnglishTitle(fields.titles),
    resolveNativeTitle(fields.titles),
    resolveRomanizedTitle(fields.titles),
    ...extractCatalogTitleStrings(fields.titles),
  ].filter((t): t is string => Boolean(t?.trim()));

  for (const candidate of candidates) {
    if (!isUnknownPlaceholderTitle(candidate)) return candidate;
  }
  return candidates[0]?.trim() || 'Untitled';
}

export function withResolvedDisplayTitle<T extends SeriesTitleFields>(row: T): T & { title: string; nativeTitle: string | null; romanizedTitle: string | null } {
  return {
    ...row,
    title: resolveDisplayTitle(row),
    nativeTitle: resolveNativeTitle(row.titles),
    romanizedTitle: resolveRomanizedTitle(row.titles),
  };
}
