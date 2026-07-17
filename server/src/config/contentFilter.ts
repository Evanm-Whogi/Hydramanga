import { sql, SQL } from 'drizzle-orm';

/**
 * Content Filter Configuration
 * Handles NSFW and adult content filtering based on environment settings and user preference
 */

// Genres that are considered NSFW when user has "hide NSFW" enabled (global setting)
export const NSFW_BLOCKED_GENRES = [
  'hentai',
  'lolicon',
  'shotacon',
  'smut',
] as const;

export const NSFW_BLOCKED_RATINGS = ['pornographic'] as const;

// Default blocked genres if not specified in env (server-wide ALLOW_NSFW_CONTENT)
const DEFAULT_BLOCKED_GENRES = [...NSFW_BLOCKED_GENRES];

/**
 * Get list of blocked genres based on ALLOW_NSFW_CONTENT setting
 * If ALLOW_NSFW_CONTENT=false, the genres in BLOCKED_GENRES are filtered
 * If ALLOW_NSFW_CONTENT=true, no genres are filtered
 */
export function getBlockedGenres(): string[] {
  const allowNsfw = process.env.ALLOW_NSFW_CONTENT !== 'false';

  // If NSFW is allowed, don't block anything
  if (allowNsfw) {
    return [];
  }

  // If NSFW is not allowed, get blocked genres from env or use defaults
  let blocked: string[] = [];

  if (process.env.BLOCKED_GENRES) {
    blocked = process.env.BLOCKED_GENRES
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
  } else {
    blocked = DEFAULT_BLOCKED_GENRES;
  }

  // Remove duplicates and return
  return [...new Set(blocked)];
}

/**
 * Check if a manga should be filtered based on its genres
 * @param genres - Array of genre strings from manga
 * @returns true if manga should be filtered (blocked), false if it should be shown
 */
export function shouldFilterManga(genres: string[] | null | undefined): boolean {
  if (!genres || genres.length === 0) return false;

  const blockedGenres = getBlockedGenres();
  if (blockedGenres.length === 0) return false; // No filtering if NSFW allowed

  const normalizedGenres = genres.map((g) => g.toLowerCase().trim());

  return normalizedGenres.some((genre) =>
    blockedGenres.some((blocked) =>
      genre.includes(blocked) || blocked.includes(genre)
    )
  );
}

/**
 * Filter an array of manga, removing blocked content
 * @param mangaList - Array of manga objects with genres property
 * @returns Filtered array excluding blocked manga
 */
export function filterBlockedManga<T extends { genres?: string[] | null }>(
  mangaList: T[]
): T[] {
  return mangaList.filter((manga) => !shouldFilterManga(manga.genres));
}

/**
 * Get a SQL-compatible array of blocked genre values for database queries
 * Useful for SQL WHERE NOT IN clauses
 */
export function getBlockedGenresForSQL(): string[] {
  return getBlockedGenres();
}

/**
 * Check if a series should be hidden for a user with "hide NSFW" enabled.
 */
export function isSeriesHiddenByUserNsfw(
  manga: { contentRating?: string | null; genres?: string[] | null },
  hideNsfw: boolean,
): boolean {
  if (!hideNsfw) return false;

  const rating = manga.contentRating?.toLowerCase().trim();
  if (rating && (NSFW_BLOCKED_RATINGS as readonly string[]).includes(rating)) {
    return true;
  }

  if (!manga.genres?.length) return false;

  return manga.genres.some((genre) => {
    const normalized = genre.toLowerCase().trim();
    return NSFW_BLOCKED_GENRES.some((blocked) => normalized === blocked);
  });
}

/**
 * Returns Drizzle SQL conditions to hide NSFW content when user preference hideNsfw is true.
 * Filters out: contentRating 'pornographic' and genres containing any of NSFW_BLOCKED_GENRES (case-insensitive).
 * Use with and(...conditions) in queries. When hideNsfw is false, returns [] (no filter).
 */
/**
 * Genres in the catalog are Title Case (`Hentai`, not `hentai`). Prefer GIN-friendly
 * `@>` containment over `jsonb_array_elements_text` — the unnest form forces a correlated
 * SubPlan and turns cold discover COUNT(*) into multi-second seq scans on ~600k rows.
 * Predicate shape must stay aligned with `idx_series_discover_sfw_popularity` so COUNT
 * can use an index-only scan (~25ms vs ~500ms seq scan).
 */
function nsfwGenreContainmentSql(genresColumn: any): SQL {
  const titled = NSFW_BLOCKED_GENRES.map((g) => g.charAt(0).toUpperCase() + g.slice(1));
  const checks = titled.map((g) => sql`${genresColumn} @> ${JSON.stringify([g])}::jsonb`);
  return sql`(${genresColumn} IS NULL OR NOT (${sql.join(checks, sql` OR `)}))`;
}

export function getNsfwFilterConditions(hideNsfw: boolean, seriesTable: { contentRating: any; genres: any; id: any }): SQL[] {
  if (!hideNsfw) return [];
  // Predicate must match idx_series_discover_sfw_popularity exactly (including the
  // `IS NULL OR …` form) or Postgres falls back from index-only COUNT to a heap scan.
  return [
    sql`(${seriesTable.contentRating} IS NULL OR ${seriesTable.contentRating} IS DISTINCT FROM 'pornographic')`,
    nsfwGenreContainmentSql(seriesTable.genres),
  ];
}

export function isNovelType(type: string | null | undefined): boolean {
  return (type ?? '').trim().toLowerCase() === 'novel';
}

/** Exclude light novels from catalog/browse queries. Types are stored lowercase; avoid lower(trim()) so planners can use partial/btree indexes. */
export function getExcludeNovelConditions(seriesTable: { type: any }): SQL[] {
  return [sql`${seriesTable.type} IS DISTINCT FROM 'novel'`];
}

/** Exclude series merged into another catalog entry (duplicate titles / stale ids). */
export function getExcludeMergedConditions(seriesTable: { state: any }): SQL[] {
  return [sql`${seriesTable.state} IS DISTINCT FROM 'merged'`];
}

/** NSFW preference + always hide novels and merged duplicates from catalog surfaces. */
export function getCatalogFilterConditions(hideNsfw: boolean, seriesTable: { contentRating: any; genres: any; id: any; type: any; state: any }): SQL[] {
  return [...getExcludeNovelConditions(seriesTable), ...getExcludeMergedConditions(seriesTable), ...getNsfwFilterConditions(hideNsfw, seriesTable)];
}

