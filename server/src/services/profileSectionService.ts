import { db, schema } from '@/db/index';
import { eq, or, and, desc, sql, count } from 'drizzle-orm';
import { getUserSettings } from '@/services/userSettingsService';
import { canViewProfileSection } from '@/lib/profileVisibility';
import { seriesCardColumns, enrichSeriesListExtras } from '@/lib/seriesQueries';
import { resolveCoverUrl } from '@/lib/coverUtils';
import { getCatalogFilterConditions, getExcludeNovelConditions, isNovelType } from '@/config/contentFilter';
import { BookmarkService, type BookmarkSort, type BookmarkStatus } from '@/services/bookmarkService';
import { badgeService } from '@/services/badgeService';

const MAX_FAVORITES = 10;
const AUTHOR_COLUMNS = { id: true, name: true, image: true, role: true, username: true, displayUsername: true } as const;

export class ProfileAccessError extends Error {
  constructor(message: string, readonly statusCode = 403) {
    super(message);
    this.name = 'ProfileAccessError';
  }
}

export async function resolveUserId(identifier: string, viewerUserId: string | null): Promise<{ userId: string; isOwner: boolean } | null> {
  if (identifier === 'me') {
    if (!viewerUserId) return null;
    return { userId: viewerUserId, isOwner: true };
  }
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(or(eq(schema.user.username, identifier), eq(schema.user.id, identifier)))
    .limit(1);
  if (!row) return null;
  return { userId: row.id, isOwner: viewerUserId !== null && row.id === viewerUserId };
}

export async function assertProfileAccess(identifier: string, viewerUserId: string | null, section: Parameters<typeof canViewProfileSection>[1]): Promise<{ userId: string; isOwner: boolean }> {
  const resolved = await resolveUserId(identifier, viewerUserId);
  if (!resolved) throw new ProfileAccessError('User not found', 404);
  const settings = await getUserSettings(resolved.userId);
  if (!resolved.isOwner && !settings.isProfilePublic) throw new ProfileAccessError('Profile is private', 403);
  if (!canViewProfileSection(settings.profileVisibility, section, resolved.isOwner)) throw new ProfileAccessError('Section is hidden', 403);
  return resolved;
}

class ProfileSectionService {
  async getFavorites(identifier: string, viewerUserId: string | null) {
    const { userId } = await assertProfileAccess(identifier, viewerUserId, 'favorites');
    const { hideNsfw } = await getUserSettings(viewerUserId ?? undefined);
    const nsfwConditions = getCatalogFilterConditions(hideNsfw, schema.series);

    const rows = await db
      .select({
        sortOrder: schema.userFavoriteSeries.sortOrder,
        ...seriesCardColumns,
      })
      .from(schema.userFavoriteSeries)
      .innerJoin(schema.series, eq(schema.userFavoriteSeries.seriesId, schema.series.id))
      .where(and(eq(schema.userFavoriteSeries.userId, userId), ...nsfwConditions))
      .orderBy(schema.userFavoriteSeries.sortOrder, schema.userFavoriteSeries.createdAt);

    const enriched = await enrichSeriesListExtras(rows);
    return enriched;
  }

  async setFavorites(userId: string, seriesIds: number[]) {
    const uniqueIds = [...new Set(seriesIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (uniqueIds.length > MAX_FAVORITES) throw new ProfileAccessError(`You can only have up to ${MAX_FAVORITES} favorites`, 400);

    if (uniqueIds.length > 0) {
      const existing = await db
        .select({ id: schema.series.id, type: schema.series.type })
        .from(schema.series)
        .where(sql`${schema.series.id} IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})`);
      const validIds = new Set(existing.filter((r) => !isNovelType(r.type)).map((r) => r.id));
      for (const id of uniqueIds) {
        if (!validIds.has(id)) throw new ProfileAccessError(`Series ${id} not found`, 404);
      }
    }

    await db.delete(schema.userFavoriteSeries).where(eq(schema.userFavoriteSeries.userId, userId));
    if (uniqueIds.length > 0) {
      await db.insert(schema.userFavoriteSeries).values(
        uniqueIds.map((seriesId, index) => ({ userId, seriesId, sortOrder: index }))
      );
    }
    badgeService.evaluateBadgesAsync(userId, 'profile_update');
    return this.getFavorites('me', userId);
  }

  async getUserComments(identifier: string, viewerUserId: string | null, page = 1, limit = 30) {
    const { userId } = await assertProfileAccess(identifier, viewerUserId, 'comments');
    const offset = (Math.max(1, page) - 1) * limit;

    const [totalRow] = await db
      .select({ count: count() })
      .from(schema.comments)
      .where(eq(schema.comments.userId, userId));

    const rows = await db
      .select({
        id: schema.comments.id,
        content: schema.comments.content,
        seriesId: schema.comments.seriesId,
        createdAt: schema.comments.createdAt,
        seriesTitle: schema.series.title,
        seriesCover: schema.series.cover,
      })
      .from(schema.comments)
      .innerJoin(schema.series, eq(schema.comments.seriesId, schema.series.id))
      .where(eq(schema.comments.userId, userId))
      .orderBy(desc(schema.comments.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      comments: rows.map((row) => ({
        id: row.id,
        content: row.content,
        seriesId: row.seriesId,
        createdAt: row.createdAt,
        series: {
          id: row.seriesId,
          title: row.seriesTitle,
          cover: resolveCoverUrl(row.seriesCover),
        },
      })),
      pagination: {
        page: Math.max(1, page),
        limit,
        total: Number(totalRow?.count ?? 0),
        hasMore: offset + rows.length < Number(totalRow?.count ?? 0),
      },
    };
  }

  async getRecentReads(identifier: string, viewerUserId: string | null, page = 1, limit = 20) {
    const { userId } = await assertProfileAccess(identifier, viewerUserId, 'recentReads');
    const { hideNsfw } = await getUserSettings(viewerUserId ?? undefined);
    const nsfwConditions = getCatalogFilterConditions(hideNsfw, schema.series);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (Math.max(1, page) - 1) * safeLimit;

    const [totalRow] = await db
      .select({ count: count() })
      .from(schema.userReadingProgress)
      .innerJoin(schema.series, eq(schema.userReadingProgress.seriesId, schema.series.id))
      .where(and(eq(schema.userReadingProgress.userId, userId), ...nsfwConditions));

    const rows = await db
      .select({
        seriesId: schema.userReadingProgress.seriesId,
        percentageCompleted: schema.userReadingProgress.percentageCompleted,
        updatedAt: schema.userReadingProgress.updatedAt,
        title: schema.series.title,
        cover: schema.series.cover,
        type: schema.series.type,
      })
      .from(schema.userReadingProgress)
      .innerJoin(schema.series, eq(schema.userReadingProgress.seriesId, schema.series.id))
      .where(and(eq(schema.userReadingProgress.userId, userId), ...nsfwConditions))
      .orderBy(desc(schema.userReadingProgress.updatedAt))
      .limit(safeLimit)
      .offset(offset);

    const total = Number(totalRow?.count ?? 0);

    return {
      items: rows.map((row) => ({
        seriesId: row.seriesId,
        title: row.title,
        cover: resolveCoverUrl(row.cover),
        type: row.type,
        percentageCompleted: row.percentageCompleted,
        updatedAt: row.updatedAt,
      })),
      pagination: {
        page: Math.max(1, page),
        limit: safeLimit,
        total,
        hasMore: offset + rows.length < total,
      },
    };
  }

  async getProfileBookmarks(identifier: string, viewerUserId: string | null, options: { sort?: BookmarkSort; status?: BookmarkStatus[]; types?: string[]; limit?: number; offset?: number } = {}) {
    const { userId } = await assertProfileAccess(identifier, viewerUserId, 'bookmarks');
    const { hideNsfw } = await getUserSettings(viewerUserId ?? undefined);
    const limit = Math.min(500, Math.max(1, options.limit ?? 500));
    const offset = Math.max(0, options.offset ?? 0);
    const result = await BookmarkService.getUserBookmarks(userId, { sort: options.sort ?? 'bookmarked', limit, offset, hideNsfw, status: options.status, types: options.types });
    return {
      bookmarks: result.items,
      total: result.total,
    };
  }

  async getPublicLists(identifier: string, viewerUserId: string | null) {
    const { userId, isOwner } = await assertProfileAccess(identifier, viewerUserId, 'lists');
    const lists = await db.query.curatedLists.findMany({
      where: isOwner
        ? eq(schema.curatedLists.userId, userId)
        : and(eq(schema.curatedLists.userId, userId), eq(schema.curatedLists.visibility, 'public')),
      orderBy: [desc(schema.curatedLists.updatedAt)],
      columns: {
        id: true,
        title: true,
        slug: true,
        description: true,
        visibility: true,
        viewCount: true,
        likeCount: true,
        itemCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return lists;
  }
}

export const profileSectionService = new ProfileSectionService();
