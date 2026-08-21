import axios from 'axios';
import { db, schema } from '@/db/index';
import { eq, inArray } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { cacheService } from '@/services/cacheService';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const MANGABAKA_API_BASE = 'https://api.mangabaka.org/v1';
const MIN_LANDSCAPE_ASPECT = 1.3;
const TARGET_ASPECT = 16 / 9;
const BANNER_CACHE_TTL_SECONDS = 5 * 24 * 60 * 60;
const RESOLVE_STALE_MS = 90 * 24 * 60 * 60 * 1000;
const MANGABAKA_MIN_INTERVAL_MS = 750;
const ANILIST_MIN_INTERVAL_MS = 1200;
const ANILIST_BATCH_SIZE = 25;
const KITSU_MIN_INTERVAL_MS = 500;
const EXTERNAL_429_MAX_RETRIES = 2;
const SOURCE_COOLDOWN_MS = 90_000;
const BANNER_RESOLVE_CONCURRENCY = 1;

const ANILIST_BATCH_QUERY = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id
      bannerImage
    }
  }
}`;

type BannerSource = 'anilist' | 'kitsu' | 'mangabaka' | 'admin';
type BannerAttemptStatus = 'ok' | 'none' | 'skip' | 'error';
type BannerAttemptKey = 'anilist' | 'kitsu' | 'mangabaka';

type SeriesBanner = {
  url?: string | null;
  source?: BannerSource;
  width?: number;
  height?: number;
  aspectRatio?: number;
  fetchedAt?: string;
  absent?: boolean;
  attempts?: Partial<Record<BannerAttemptKey, BannerAttemptStatus>>;
};

type SeriesCover = Record<string, unknown> & { banner?: SeriesBanner };

type BannerCandidate = {
  url: string;
  source: BannerSource;
  width?: number;
  height?: number;
  aspectRatio: number;
  sourcePriority: number;
};

const SOURCE_PRIORITY: Record<BannerSource, number> = {
  admin: 0,
  anilist: 1,
  mangabaka: 2,
  kitsu: 3,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimitedError extends Error {
  constructor(readonly source: string) {
    super(`rate_limited:${source}`);
    this.name = 'RateLimitedError';
  }
}

function isRateLimitedError(error: unknown): boolean {
  if (error instanceof RateLimitedError) return true;
  if (!axios.isAxiosError(error)) return false;
  return error.response?.status === 429;
}

function createThrottledQueue(minIntervalMs: number) {
  let queue: Promise<void> = Promise.resolve();
  let lastRequestAt = 0;
  return async function withThrottle<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      const waitMs = minIntervalMs - (Date.now() - lastRequestAt);
      if (waitMs > 0) await sleep(waitMs);
      lastRequestAt = Date.now();
      return fn();
    };
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}

const withAnilistThrottle = createThrottledQueue(ANILIST_MIN_INTERVAL_MS);
const withKitsuThrottle = createThrottledQueue(KITSU_MIN_INTERVAL_MS);
const withMangabakaThrottle = createThrottledQueue(MANGABAKA_MIN_INTERVAL_MS);

const sourceCooldownUntil: Partial<Record<string, number>> = {};

async function waitForSourceCooldown(source: string): Promise<void> {
  const until = sourceCooldownUntil[source] ?? 0;
  const waitMs = until - Date.now();
  if (waitMs > 0) {
    logger.info(`${source} cooling down; waiting ${waitMs}ms`, { service: 'seriesBannerService' });
    await sleep(waitMs);
  }
}

function setSourceCooldown(source: string, retryAfterMs?: number): void {
  const cooldownMs = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : SOURCE_COOLDOWN_MS;
  const until = Date.now() + cooldownMs;
  sourceCooldownUntil[source] = Math.max(sourceCooldownUntil[source] ?? 0, until);
  logger.warn(`${source} rate limited — pausing requests until ${new Date(until).toISOString()}`, { service: 'seriesBannerService' });
}

function parseRetryAfterMs(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return undefined;
}

async function retryOnRateLimit<T>(source: string, fn: () => Promise<T>): Promise<T> {
  await waitForSourceCooldown(source);
  for (let attempt = 1; attempt <= EXTERNAL_429_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitedError(error) || attempt >= EXTERNAL_429_MAX_RETRIES) throw error;
      const retryAfterHeader = axios.isAxiosError(error) ? Number(error.response?.headers?.['retry-after']) : NaN;
      const waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : SOURCE_COOLDOWN_MS;
      setSourceCooldown(source, waitMs);
      await waitForSourceCooldown(source);
    }
  }
  throw new RateLimitedError(source);
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function getSourceId(source: unknown, provider: string): string | null {
  if (!source || typeof source !== 'object') return null;
  const rawId = (source as Record<string, { id?: string | number }>)[provider]?.id;
  if (rawId == null || rawId === '') return null;
  return String(rawId);
}

function parseAspectRatio(width?: number, height?: number, fallback = TARGET_ASPECT): number {
  if (width != null && height != null && width > 0 && height > 0) return width / height;
  return fallback;
}

function isLandscapeEnough(candidate: BannerCandidate, explicitBanner = false): boolean {
  if (explicitBanner) return true;
  return candidate.aspectRatio >= MIN_LANDSCAPE_ASPECT;
}

function scoreCandidate(candidate: BannerCandidate): number {
  const aspectScore = 1 - Math.min(1, Math.abs(candidate.aspectRatio - TARGET_ASPECT) / TARGET_ASPECT);
  const area = (candidate.width ?? 800) * (candidate.height ?? 450);
  const areaScore = Math.min(1, area / (1920 * 1080));
  const priorityScore = 1 - candidate.sourcePriority / 4;
  return priorityScore * 0.45 + aspectScore * 0.35 + areaScore * 0.2;
}

function pickBestCandidate(candidates: BannerCandidate[]): BannerCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] ?? null;
}

function getBanner(cover: unknown): SeriesBanner | null {
  if (!cover || typeof cover !== 'object') return null;
  const banner = (cover as SeriesCover).banner;
  return banner && typeof banner === 'object' ? banner : null;
}

function hasFreshBanner(cover: unknown): boolean {
  const banner = getBanner(cover);
  if (!banner?.url || typeof banner.url !== 'string' || banner.url.length === 0) return false;
  if (banner.source === 'admin') return true;
  if (!banner.fetchedAt) return true;
  const age = Date.now() - new Date(banner.fetchedAt).getTime();
  return Number.isFinite(age) && age < RESOLVE_STALE_MS;
}

function isAdminBanner(cover: unknown): boolean {
  const banner = getBanner(cover);
  return banner?.source === 'admin' && typeof banner.url === 'string' && banner.url.length > 0;
}

function allSourcesAttempted(source: unknown, attempts: Partial<Record<BannerAttemptKey, BannerAttemptStatus>> | undefined): boolean {
  const required: BannerAttemptKey[] = [];
  if (getSourceId(source, 'anilist')) required.push('anilist');
  if (getSourceId(source, 'kitsu')) required.push('kitsu');
  required.push('mangabaka');
  return required.every((key) => {
    const status = attempts?.[key];
    return status != null && status !== 'error';
  });
}

function needsResolution(row: { cover: unknown; source: unknown }): boolean {
  if (isAdminBanner(row.cover)) return false;
  if (hasFreshBanner(row.cover)) return false;
  const banner = getBanner(row.cover);
  if (banner?.absent === true && allSourcesAttempted(row.source, banner.attempts)) return false;
  return true;
}

async function fetchAnilistBannerChunk(anilistIds: number[]): Promise<{ banners: Map<number, string | null>; rateLimited: boolean }> {
  const banners = new Map<number, string | null>();
  if (anilistIds.length === 0) return { banners, rateLimited: false };

  await waitForSourceCooldown('anilist');

  for (let attempt = 1; attempt <= EXTERNAL_429_MAX_RETRIES; attempt++) {
    const response = await withAnilistThrottle(() => fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_BATCH_QUERY, variables: { ids: anilistIds } }),
    }));

    if (response.status === 429) {
      setSourceCooldown('anilist', parseRetryAfterMs(response));
      if (attempt < EXTERNAL_429_MAX_RETRIES) {
        await waitForSourceCooldown('anilist');
        continue;
      }
      return { banners, rateLimited: true };
    }

    if (!response.ok) {
      logger.warn(`AniList batch banner request failed: HTTP ${response.status}`, { service: 'seriesBannerService' });
      for (const id of anilistIds) banners.set(id, null);
      return { banners, rateLimited: false };
    }

    const payload = await response.json().catch(() => null) as {
      data?: { Page?: { media?: Array<{ id?: number; bannerImage?: string | null } | null> | null } };
    } | null;

    const media = payload?.data?.Page?.media ?? [];
    const foundIds = new Set<number>();
    for (const entry of media) {
      if (!entry || entry.id == null) continue;
      foundIds.add(entry.id);
      const bannerImage = entry.bannerImage;
      banners.set(entry.id, typeof bannerImage === 'string' && bannerImage.length > 0 ? bannerImage : null);
    }
    for (const id of anilistIds) {
      if (!foundIds.has(id)) banners.set(id, null);
    }
    return { banners, rateLimited: false };
  }

  return { banners, rateLimited: true };
}

async function fetchAnilistBannersBatch(anilistIds: number[]): Promise<{ banners: Map<number, string | null>; rateLimited: boolean }> {
  const merged = new Map<number, string | null>();
  const uniqueIds = [...new Set(anilistIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) return { banners: merged, rateLimited: false };

  for (let i = 0; i < uniqueIds.length; i += ANILIST_BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + ANILIST_BATCH_SIZE);
    const chunkResult = await fetchAnilistBannerChunk(chunk);
    if (chunkResult.rateLimited) return { banners: merged, rateLimited: true };
    for (const [id, url] of chunkResult.banners) merged.set(id, url);
  }

  return { banners: merged, rateLimited: false };
}

function anilistCandidateFromUrl(url: string | null | undefined): BannerCandidate | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  return {
    url,
    source: 'anilist',
    aspectRatio: TARGET_ASPECT,
    sourcePriority: SOURCE_PRIORITY.anilist,
  };
}

async function fetchAnilistBannerUrl(anilistId: string): Promise<BannerCandidate | null> {
  const parsedId = Number(anilistId);
  if (!Number.isFinite(parsedId)) return null;
  const { banners, rateLimited } = await fetchAnilistBannersBatch([parsedId]);
  if (rateLimited) throw new RateLimitedError('anilist');
  return anilistCandidateFromUrl(banners.get(parsedId));
}

async function fetchKitsuCoverImage(kitsuId: string): Promise<BannerCandidate | null> {
  return retryOnRateLimit('kitsu', async () => {
    const response = await withKitsuThrottle(() => fetch(`${KITSU_API_BASE}/manga/${encodeURIComponent(kitsuId)}`, {
      headers: { Accept: 'application/vnd.api+json' },
    }));

    if (response.status === 429) throw new RateLimitedError('kitsu');
    if (!response.ok) {
      logger.warn(`Kitsu cover request failed for id=${kitsuId}: HTTP ${response.status}`, { service: 'seriesBannerService' });
      return null;
    }

    const payload = await response.json().catch(() => null) as {
      data?: { attributes?: { coverImage?: { original?: string | null; meta?: { dimensions?: { original?: { width?: number; height?: number } } } } } };
    } | null;

    const coverImage = payload?.data?.attributes?.coverImage;
    const url = coverImage?.original;
    if (typeof url !== 'string' || url.length === 0) return null;

    const dims = coverImage?.meta?.dimensions?.original;
    const width = dims?.width;
    const height = dims?.height;
    const aspectRatio = parseAspectRatio(width, height, 1.6);

    return {
      url,
      source: 'kitsu' as const,
      width,
      height,
      aspectRatio,
      sourcePriority: SOURCE_PRIORITY.kitsu,
    };
  });
}

type MangabakaGalleryItem = {
  type?: string;
  image?: { raw?: { url?: string; width?: number; height?: number } };
};

async function fetchMangabakaGalleryItems(seriesId: number): Promise<MangabakaGalleryItem[]> {
  return retryOnRateLimit('mangabaka', async () => {
    const response = await withMangabakaThrottle(async () => axios.get(`${MANGABAKA_API_BASE}/series/${seriesId}/images`, {
      params: { language: ['en', 'ja'] },
      timeout: 15000,
    }));
    const data = response.data?.data;
    return Array.isArray(data) ? data as MangabakaGalleryItem[] : [];
  });
}

async function fetchMangabakaGalleryCandidates(seriesId: number): Promise<BannerCandidate[]> {
  const cacheKey = `banner:mangabaka-gallery:${seriesId}`;

  let items: MangabakaGalleryItem[];
  try {
    items = await cacheService.getOrSet(
      { key: cacheKey, ttl: BANNER_CACHE_TTL_SECONDS, staleIfError: BANNER_CACHE_TTL_SECONDS },
      async () => fetchMangabakaGalleryItems(seriesId),
    );
  } catch (error) {
    if (isRateLimitedError(error)) throw error;
    logger.warn(`MangaBaka gallery cache fetch failed for series ${seriesId}: ${error}`, { service: 'seriesBannerService' });
    return [];
  }

  const candidates: BannerCandidate[] = [];
  for (const item of items) {
    const raw = item.image?.raw;
    const url = raw?.url;
    if (typeof url !== 'string' || url.length === 0) continue;

    const width = raw?.width;
    const height = raw?.height;
    const aspectRatio = parseAspectRatio(width, height, item.type === 'banner' ? 1.4 : 0.67);
    const explicitBanner = item.type === 'banner';
    const candidate: BannerCandidate = {
      url,
      source: 'mangabaka',
      width,
      height,
      aspectRatio,
      sourcePriority: SOURCE_PRIORITY.mangabaka,
    };

    if (isLandscapeEnough(candidate, explicitBanner)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

async function persistBanner(seriesId: number, cover: unknown, banner: SeriesBanner): Promise<void> {
  const base = cover && typeof cover === 'object' ? { ...(cover as SeriesCover) } : {};
  const updatedCover: SeriesCover = { ...base, banner };
  await db.update(schema.series).set({ cover: updatedCover }).where(eq(schema.series.id, seriesId));
}

async function runSourceFetch(key: BannerAttemptKey, run: () => Promise<BannerCandidate | BannerCandidate[] | null>): Promise<{ key: BannerAttemptKey; result: BannerCandidate | BannerCandidate[] | null; rateLimited: boolean }> {
  try {
    const result = await run();
    return { key, result, rateLimited: false };
  } catch (error) {
    if (isRateLimitedError(error)) {
      logger.warn(`${key} banner fetch rate limited`, { service: 'seriesBannerService' });
      return { key, result: null, rateLimited: true };
    }
    logger.warn(`${key} banner fetch error: ${error}`, { service: 'seriesBannerService' });
    return { key, result: null, rateLimited: false };
  }
}

function recordAttempt(attempts: Partial<Record<BannerAttemptKey, BannerAttemptStatus>>, key: BannerAttemptKey, result: BannerCandidate | BannerCandidate[] | null, rateLimited: boolean): BannerCandidate[] {
  if (rateLimited) return [];
  if (result == null) {
    attempts[key] = 'none';
    return [];
  }
  if (Array.isArray(result)) {
    if (result.length > 0) {
      attempts[key] = 'ok';
      return result;
    }
    attempts[key] = 'none';
    return [];
  }
  attempts[key] = 'ok';
  return [result];
}

type ResolveBannerOptions = {
  anilistPrefetched?: BannerCandidate | null;
  anilistRateLimited?: boolean;
};

async function resolveBannerForSeries(row: { id: number; cover: unknown; source: unknown }, options: ResolveBannerOptions = {}): Promise<void> {
  if (!needsResolution(row)) return;

  const [fresh] = await db
    .select({ cover: schema.series.cover, source: schema.series.source })
    .from(schema.series)
    .where(eq(schema.series.id, row.id))
    .limit(1);

  const cover = fresh?.cover ?? row.cover;
  const source = fresh?.source ?? row.source;
  if (!needsResolution({ cover, source })) return;

  const existingBanner = getBanner(cover);
  const attempts: Partial<Record<BannerAttemptKey, BannerAttemptStatus>> = { ...(existingBanner?.attempts ?? {}) };

  const anilistId = getSourceId(source, 'anilist');
  const kitsuId = getSourceId(source, 'kitsu');
  const candidates: BannerCandidate[] = [];

  if (anilistId && (attempts.anilist == null || attempts.anilist === 'error')) {
    if (options.anilistRateLimited) {
      // Leave unset — retry on a later backfill pass after cooldown.
    } else if (options.anilistPrefetched !== undefined) {
      candidates.push(...recordAttempt(attempts, 'anilist', options.anilistPrefetched, false));
    } else {
      const anilistResult = await runSourceFetch('anilist', () => fetchAnilistBannerUrl(anilistId));
      candidates.push(...recordAttempt(attempts, 'anilist', anilistResult.result, anilistResult.rateLimited));
    }
  }

  let best = pickBestCandidate(candidates);

  if (!best && kitsuId && (attempts.kitsu == null || attempts.kitsu === 'error')) {
    const kitsuResult = await runSourceFetch('kitsu', () => fetchKitsuCoverImage(kitsuId));
    candidates.push(...recordAttempt(attempts, 'kitsu', kitsuResult.result, kitsuResult.rateLimited));
    best = pickBestCandidate(candidates);
  }

  if (!best && (attempts.mangabaka == null || attempts.mangabaka === 'error')) {
    const mangabakaResult = await runSourceFetch('mangabaka', () => fetchMangabakaGalleryCandidates(row.id));
    candidates.push(...recordAttempt(attempts, 'mangabaka', mangabakaResult.result, mangabakaResult.rateLimited));
    best = pickBestCandidate(candidates);
  } else if (best && attempts.mangabaka == null) {
    attempts.mangabaka = 'skip';
  }

  const fetchedAt = new Date().toISOString();

  if (best) {
    await persistBanner(row.id, cover, {
      url: best.url,
      source: best.source,
      width: best.width,
      height: best.height,
      aspectRatio: best.aspectRatio,
      fetchedAt,
      absent: false,
      attempts,
    });
    logger.info(`Stored ${best.source} banner for series ${row.id}`, { service: 'seriesBannerService' });
    return;
  }

  if (allSourcesAttempted(source, attempts)) {
    await persistBanner(row.id, cover, {
      url: null,
      absent: true,
      fetchedAt,
      attempts,
    });
    logger.debug(`No banner found for series ${row.id} after all sources`, { service: 'seriesBannerService' });
    return;
  }

  await persistBanner(row.id, cover, {
    ...(existingBanner ?? {}),
    url: existingBanner?.url ?? null,
    fetchedAt: existingBanner?.fetchedAt ?? fetchedAt,
    attempts,
  });
}

export const seriesBannerService = {
  async ensureBannersForSeries(seriesIds: number[]): Promise<void> {
    const uniqueIds = [...new Set(seriesIds.filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) return;

    const rows = await db
      .select({ id: schema.series.id, cover: schema.series.cover, source: schema.series.source })
      .from(schema.series)
      .where(inArray(schema.series.id, uniqueIds));

    const pending = rows.filter((row) => needsResolution(row));
    if (pending.length === 0) return;

    const anilistIdsToFetch: number[] = [];
    const anilistIdBySeriesId = new Map<number, number>();

    for (const row of pending) {
      const banner = getBanner(row.cover);
      const attempts = banner?.attempts;
      const anilistIdStr = getSourceId(row.source, 'anilist');
      if (!anilistIdStr) continue;
      if (attempts?.anilist != null && attempts.anilist !== 'error') continue;
      const anilistId = Number(anilistIdStr);
      if (!Number.isFinite(anilistId)) continue;
      anilistIdBySeriesId.set(row.id, anilistId);
      anilistIdsToFetch.push(anilistId);
    }

    const { banners: anilistBanners, rateLimited: anilistRateLimited } = await fetchAnilistBannersBatch(anilistIdsToFetch);

    await runWithConcurrency(pending, BANNER_RESOLVE_CONCURRENCY, (row) => {
      const anilistId = anilistIdBySeriesId.get(row.id);
      const prefetched = anilistId != null && !anilistRateLimited
        ? anilistCandidateFromUrl(anilistBanners.get(anilistId))
        : undefined;
      return resolveBannerForSeries(row, {
        anilistPrefetched: prefetched,
        anilistRateLimited: anilistRateLimited && anilistId != null,
      });
    });
  },

  async ensureBannerForSeries(seriesId: number): Promise<void> {
    if (!Number.isFinite(seriesId)) return;
    await seriesBannerService.ensureBannersForSeries([seriesId]);
  },

  async getCoversBySeriesIds(seriesIds: number[]): Promise<Map<number, unknown>> {
    const uniqueIds = [...new Set(seriesIds.filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) return new Map();

    const rows = await db
      .select({ id: schema.series.id, cover: schema.series.cover })
      .from(schema.series)
      .where(inArray(schema.series.id, uniqueIds));

    return new Map(rows.map((row) => [row.id, row.cover]));
  },

  async getCoverBySeriesId(seriesId: number): Promise<unknown | null> {
    const [row] = await db
      .select({ cover: schema.series.cover })
      .from(schema.series)
      .where(eq(schema.series.id, seriesId))
      .limit(1);
    return row?.cover ?? null;
  },
};
