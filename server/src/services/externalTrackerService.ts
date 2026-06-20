import { db, schema } from '@/db/index';
import { eq, inArray, sql } from 'drizzle-orm';
import { CONTENT_LIMITS } from '@/lib/securityLimits';
import logger from '@/services/loggerService';

export type ImportMode = 'merge' | 'replace';
export type TrackerProvider = 'anilist' | 'my_anime_list';

type BookmarkStatus = (typeof schema.bookmarkStatusEnum.enumValues)[number];

export type ExternalEntry = { externalId: string; status: BookmarkStatus };
export type SyncSummary = { total: number; matched: number; unmatched: number };

/** Thrown for user-facing fetch problems (bad username, private list). Controller maps to 4xx. */
export class TrackerFetchError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TrackerFetchError';
    this.status = status;
  }
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
// MAL's own list endpoint (used by myanimelist.net itself) — Jikan no longer exposes user lists.
const MAL_LIST_PAGE_SIZE = 300; // entries returned per request
const MAL_MAX_PAGES = 50;

// AniList MediaListStatus -> our bookmark status
const ANILIST_STATUS_MAP: Record<string, BookmarkStatus> = {
  CURRENT: 'reading',
  PLANNING: 'planned',
  COMPLETED: 'completed',
  DROPPED: 'dropped',
  PAUSED: 'paused',
  REPEATING: 'rereading',
};

// MAL numeric manga list status -> our bookmark status
const MAL_NUMERIC_STATUS_MAP: Record<number, BookmarkStatus> = {
  1: 'reading',
  2: 'completed',
  3: 'paused',
  4: 'dropped',
  6: 'planned',
};

async function fetchAnilistLibrary(username: string): Promise<ExternalEntry[]> {
  const query = `query ($u: String) {
    MediaListCollection(userName: $u, type: MANGA) {
      lists { entries { status media { id } } }
    }
  }`;

  let response: Response;
  try {
    response = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { u: username } }),
    });
  } catch (error) {
    logger.warn(`AniList fetch failed for ${username}: ${error}`, { service: 'externalTrackerService' });
    throw new TrackerFetchError('Could not reach AniList. Try again later.', 502);
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { MediaListCollection?: { lists?: { entries?: { status?: string; media?: { id?: number } }[] }[] } };
    errors?: { message?: string; status?: number }[];
  } | null;

  if (!response.ok || payload?.errors?.length) {
    const status = payload?.errors?.[0]?.status;
    if (status === 404) throw new TrackerFetchError(`AniList user "${username}" was not found.`, 404);
    throw new TrackerFetchError('AniList rejected the request. Is the list public?', 400);
  }

  const lists = payload?.data?.MediaListCollection?.lists ?? [];
  const entries: ExternalEntry[] = [];
  for (const list of lists) {
    for (const entry of list.entries ?? []) {
      const mappedStatus = entry.status ? ANILIST_STATUS_MAP[entry.status] : undefined;
      const id = entry.media?.id;
      if (mappedStatus && id != null) entries.push({ externalId: String(id), status: mappedStatus });
    }
  }
  return entries;
}

async function fetchMalLibrary(username: string): Promise<ExternalEntry[]> {
  const entries: ExternalEntry[] = [];

  for (let page = 0; page < MAL_MAX_PAGES; page += 1) {
    const offset = page * MAL_LIST_PAGE_SIZE;
    // status=7 means "all"; the site paginates with offset in steps of MAL_LIST_PAGE_SIZE.
    const url = `https://myanimelist.net/mangalist/${encodeURIComponent(username)}/load.json?offset=${offset}&status=7`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; mang/1.0)' },
      });
    } catch (error) {
      logger.warn(`MAL fetch failed for ${username}: ${error}`, { service: 'externalTrackerService' });
      throw new TrackerFetchError('Could not reach MyAnimeList. Try again later.', 502);
    }

    if (response.status === 404) throw new TrackerFetchError(`MyAnimeList user "${username}" was not found.`, 404);
    if (!response.ok) throw new TrackerFetchError('MyAnimeList rejected the request. Is the list public?', 400);

    const payload = (await response.json().catch(() => null)) as
      | { manga_id?: number; status?: number; is_rereading?: number }[]
      | { errors?: unknown }
      | null;

    // A private/empty list returns a non-array body; stop cleanly.
    if (!Array.isArray(payload)) break;

    for (const entry of payload) {
      const id = entry.manga_id;
      let mappedStatus = entry.status != null ? MAL_NUMERIC_STATUS_MAP[entry.status] : undefined;
      if (mappedStatus === 'reading' && entry.is_rereading) mappedStatus = 'rereading';
      if (mappedStatus && id != null) entries.push({ externalId: String(id), status: mappedStatus });
    }

    if (payload.length < MAL_LIST_PAGE_SIZE) break;
  }

  return entries;
}

/**
 * Match external tracker entries to our series via the `source` JSONB external IDs and
 * upsert them into the user's bookmarks. Shared by username sync and MAL XML import.
 */
async function applyBookmarksByExternalId(
  userId: string,
  provider: TrackerProvider,
  entries: ExternalEntry[],
  mode: ImportMode,
): Promise<SyncSummary> {
  const total = entries.length;
  if (total > CONTENT_LIMITS.importMaxBookmarks) {
    throw new TrackerFetchError(`Too many entries (max ${CONTENT_LIMITS.importMaxBookmarks}).`, 400);
  }

  // Resolve external IDs -> our series ids (ignoring entries with unknown statuses).
  const validStatuses = new Set<string>(schema.bookmarkStatusEnum.enumValues);
  const idToStatus = new Map<string, BookmarkStatus>();
  for (const entry of entries) {
    if (entry.externalId && validStatuses.has(entry.status)) idToStatus.set(entry.externalId, entry.status);
  }
  const externalIds = [...idToStatus.keys()];

  const seriesByExternalId = new Map<string, number>();
  if (externalIds.length > 0) {
    const extExpr = sql<string>`${schema.series.source}->${sql.raw(`'${provider}'`)}->>'id'`;
    const rows = await db
      .select({ id: schema.series.id, ext: extExpr })
      .from(schema.series)
      .where(inArray(extExpr, externalIds));
    for (const row of rows) {
      if (row.ext != null) seriesByExternalId.set(String(row.ext), row.id);
    }
  }

  if (mode === 'replace') {
    await db.delete(schema.seriesBookmarks).where(eq(schema.seriesBookmarks.userId, userId));
  }

  let matched = 0;
  for (const [externalId, status] of idToStatus) {
    const seriesId = seriesByExternalId.get(externalId);
    if (!seriesId) continue;
    await db
      .insert(schema.seriesBookmarks)
      .values({ userId, seriesId, status })
      .onConflictDoUpdate({
        target: [schema.seriesBookmarks.userId, schema.seriesBookmarks.seriesId],
        set: { status, updatedAt: new Date() },
      });
    matched += 1;
  }

  return { total, matched, unmatched: total - matched };
}

class ExternalTrackerService {
  /** Fetch a user's public library from AniList/MAL and sync statuses into bookmarks. */
  async syncFromTracker(
    userId: string,
    provider: 'anilist' | 'myanimelist',
    username: string,
    mode: ImportMode,
  ): Promise<SyncSummary> {
    const trimmed = username.trim();
    if (!trimmed) throw new TrackerFetchError('A username is required.', 400);

    if (provider === 'anilist') {
      const entries = await fetchAnilistLibrary(trimmed);
      return applyBookmarksByExternalId(userId, 'anilist', entries, mode);
    }
    const entries = await fetchMalLibrary(trimmed);
    return applyBookmarksByExternalId(userId, 'my_anime_list', entries, mode);
  }

  /** Apply already-parsed external entries (e.g. from a MAL XML file) to bookmarks. */
  async importExternalEntries(
    userId: string,
    provider: TrackerProvider,
    entries: ExternalEntry[],
    mode: ImportMode,
  ): Promise<SyncSummary> {
    return applyBookmarksByExternalId(userId, provider, entries, mode);
  }
}

export const externalTrackerService = new ExternalTrackerService();
