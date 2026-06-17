type SeriesTitleFields = {
  title?: string | null;
  nativeTitle?: string | null;
  romanizedTitle?: string | null;
  secondaryTitles?: unknown;
};

const UNKNOWN_TITLE_RE = /^unknown title(?:\s*\(please report on discord\))?/i;

function extractSecondaryTitleStrings(secondaryTitles: unknown): string[] {
  if (!secondaryTitles) return [];

  let parsed: unknown = secondaryTitles;
  if (typeof secondaryTitles === 'string') {
    try {
      parsed = JSON.parse(secondaryTitles);
    } catch {
      parsed = secondaryTitles;
    }
  }

  const titles: string[] = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) titles.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.title === 'string') {
        const trimmed = record.title.trim();
        if (trimmed) titles.push(trimmed);
        return;
      }
      for (const nested of Object.values(record)) visit(nested);
    }
  };

  visit(parsed);

  const seen = new Set<string>();
  return titles.filter((title) => {
    const key = title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isUnknownPlaceholderTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim();
  if (!trimmed) return false;
  return UNKNOWN_TITLE_RE.test(trimmed);
}

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
