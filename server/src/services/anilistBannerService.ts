import { db, schema } from '@/db/index';
import { eq, inArray } from 'drizzle-orm';
import logger from '@/services/loggerService';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

type SeriesBanner = {
  url?: string | null;
  source?: string;
  fetchedAt?: string;
  /** Set when AniList has no banner — skip future API calls */
  absent?: boolean;
};

type SeriesCover = Record<string, unknown> & {
  banner?: SeriesBanner;
};

function getAnilistId(source: unknown): number | null {
  if (!source || typeof source !== 'object') return null;
  const rawId = (source as { anilist?: { id?: string | number } }).anilist?.id;
  if (rawId == null || rawId === '') return null;
  const parsed = Number(rawId);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when we already resolved banner state and should not call AniList again. */
function hasResolvedBanner(cover: unknown): boolean {
  if (!cover || typeof cover !== 'object') return false;
  const banner = (cover as SeriesCover).banner;
  if (!banner || typeof banner !== 'object') return false;
  if (typeof banner.url === 'string' && banner.url.length > 0) return true;
  if (banner.absent === true) return true;
  return false;
}

async function fetchAnilistBannerUrl(anilistId: number): Promise<string | null> {
  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: 'query ($id: Int) { Media(id: $id, type: MANGA) { bannerImage } }',
      variables: { id: anilistId },
    }),
  });

  if (!response.ok) {
    logger.warn(`AniList banner request failed for id=${anilistId}: HTTP ${response.status}`, { service: 'anilistBannerService' });
    return null;
  }

  const payload = await response.json().catch(() => null) as { data?: { Media?: { bannerImage?: string | null } } } | null;
  const bannerImage = payload?.data?.Media?.bannerImage;
  return typeof bannerImage === 'string' && bannerImage.length > 0 ? bannerImage : null;
}

async function persistBanner(seriesId: number, cover: unknown, banner: SeriesBanner): Promise<void> {
  const base = cover && typeof cover === 'object' ? { ...(cover as SeriesCover) } : {};
  const updatedCover: SeriesCover = { ...base, banner };

  await db.update(schema.series).set({ cover: updatedCover }).where(eq(schema.series.id, seriesId));
}

async function ensureBannerForSeries(row: { id: number; cover: unknown; source: unknown }): Promise<void> {
  if (hasResolvedBanner(row.cover)) return;

  const anilistId = getAnilistId(row.source);
  if (!anilistId) return;

  const [fresh] = await db
    .select({ cover: schema.series.cover, source: schema.series.source })
    .from(schema.series)
    .where(eq(schema.series.id, row.id))
    .limit(1);

  if (fresh && hasResolvedBanner(fresh.cover)) return;

  try {
    const bannerUrl = await fetchAnilistBannerUrl(anilistId);
    if (bannerUrl) {
      await persistBanner(row.id, fresh?.cover ?? row.cover, {
        url: bannerUrl,
        source: 'anilist',
        fetchedAt: new Date().toISOString(),
      });
      logger.info(`Stored AniList banner for series ${row.id} (anilist=${anilistId})`, { service: 'anilistBannerService' });
      return;
    }

    await persistBanner(row.id, fresh?.cover ?? row.cover, {
      url: null,
      absent: true,
      source: 'anilist',
      fetchedAt: new Date().toISOString(),
    });
    logger.debug(`AniList has no banner for series ${row.id} (anilist=${anilistId}); marked absent`, { service: 'anilistBannerService' });
  } catch (error) {
    logger.warn(`Failed to resolve AniList banner for series ${row.id}: ${error}`, { service: 'anilistBannerService' });
  }
}

export const anilistBannerService = {
  async ensureBannersForSeries(seriesIds: number[]): Promise<void> {
    const uniqueIds = [...new Set(seriesIds.filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) return;

    const rows = await db
      .select({ id: schema.series.id, cover: schema.series.cover, source: schema.series.source })
      .from(schema.series)
      .where(inArray(schema.series.id, uniqueIds));

    const pending = rows.filter((row) => !hasResolvedBanner(row.cover) && getAnilistId(row.source) != null);
    if (pending.length === 0) return;

    await Promise.all(pending.map((row) => ensureBannerForSeries(row)));
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
};
