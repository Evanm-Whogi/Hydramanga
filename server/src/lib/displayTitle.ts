import { extractSecondaryTitleStrings } from '@/lib/secondaryTitles';

const UNKNOWN_TITLE_RE = /^unknown title(?:\s*\(please report on discord\))?/i;

export type SeriesTitleFields = {
  title?: string | null;
  nativeTitle?: string | null;
  romanizedTitle?: string | null;
  secondaryTitles?: unknown;
};

export function isUnknownPlaceholderTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim();
  if (!trimmed) return false;
  return UNKNOWN_TITLE_RE.test(trimmed);
}

/** Prefer primary title unless it is the unknown placeholder; then native → romanized → secondary. */
export function resolveDisplayTitle(fields: SeriesTitleFields): string {
  const primary = fields.title?.trim() || '';
  if (primary && !isUnknownPlaceholderTitle(primary)) return primary;

  const native = fields.nativeTitle?.trim();
  if (native && !isUnknownPlaceholderTitle(native)) return native;

  const romanized = fields.romanizedTitle?.trim();
  if (romanized && !isUnknownPlaceholderTitle(romanized)) return romanized;

  const secondary = extractSecondaryTitleStrings(fields.secondaryTitles).filter((t) => !isUnknownPlaceholderTitle(t));
  if (secondary.length > 0) return secondary[0];

  return primary || 'Untitled';
}

export function withResolvedDisplayTitle<T extends SeriesTitleFields>(row: T): T {
  return { ...row, title: resolveDisplayTitle(row) };
}
