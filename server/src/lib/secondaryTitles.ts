/** Flatten series.secondaryTitles JSON into unique search strings. */
export function extractSecondaryTitleStrings(secondaryTitles: unknown): string[] {
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
