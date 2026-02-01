/**
 * Content Filter Configuration
 * Handles NSFW and adult content filtering based on environment settings
 */

// Default blocked genres if not specified in env
const DEFAULT_BLOCKED_GENRES = [
  'hentai',
  'lolicon',
  'shotacon',
  'erotica',
  'smut',
];

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

