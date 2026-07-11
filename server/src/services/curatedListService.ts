import { db, schema } from '@/db/index';
import { eq, and, or, ilike, desc, asc, sql, inArray, count, max } from 'drizzle-orm';
import { getCatalogFilterConditions, getExcludeNovelConditions, isNovelType } from '@/config/contentFilter';
import { getUserSettings } from '@/services/userSettingsService';
import { resolveCoverUrl } from '@/lib/coverUtils';
import { withResolvedDisplayTitle } from '@/lib/displayTitle';
import { seriesCardColumns, enrichSeriesListExtras } from '@/lib/seriesQueries';
import { buildThreadTree } from '@/lib/buildThreadTree';
import { enrichCommentsWithAuthorMeta } from '@/lib/enrichAuthors';
import { enrichAuthors } from '@/lib/enrichAuthors';
import { CONTENT_LIMITS } from '@/lib/securityLimits';
import { karmaService } from '@/services/karmaService';
import { notificationService } from '@/services/notificationService';
import { metricsService } from '@/services/metricsService';
import { badgeService } from '@/services/badgeService';

export type ListVisibility = 'public' | 'private';
export type ListSort = 'popular' | 'views' | 'newest' | 'title' | 'itemCount';
export type ListCommentSort = 'recent' | 'oldest' | 'top' | 'worst';

const AUTHOR_COLUMNS = { id: true, name: true, image: true, role: true, username: true, displayUsername: true } as const;

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'list';
}

async function uniqueSlugForUser(userId: string, title: string, excludeListId?: number): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  while (true) {
    const conditions = [eq(schema.curatedLists.userId, userId), eq(schema.curatedLists.slug, candidate)];
    const existing = await db.query.curatedLists.findFirst({
      where: and(...conditions),
      columns: { id: true },
    });
    if (!existing || (excludeListId && existing.id === excludeListId)) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

function canViewList(list: { visibility: string; userId: string }, userId?: string | null): boolean {
  if (list.visibility === 'public') return true;
  return Boolean(userId && list.userId === userId);
}

function getCommentScore(votes: { type: string }[]): number {
  let score = 0;
  for (const v of votes) {
    if (v.type === 'like') score += 1;
    else if (v.type === 'dislike') score -= 1;
  }
  return score;
}

function sortTopLevelComments<T extends { createdAt: Date; votes: { type: string }[] }>(comments: T[], sort: ListCommentSort): T[] {
  const sorted = [...comments];
  if (sort === 'recent') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === 'oldest') {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sort === 'top') {
    sorted.sort((a, b) => {
      const diff = getCommentScore(b.votes) - getCommentScore(a.votes);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (sort === 'worst') {
    sorted.sort((a, b) => {
      const diff = getCommentScore(a.votes) - getCommentScore(b.votes);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }
  return sorted;
}

async function fetchPreviewCovers(listIds: number[], hideNsfw: boolean): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (listIds.length === 0) return map;

  const nsfwConditions = getCatalogFilterConditions(hideNsfw, schema.series);

  const rows = await db
    .select({
      listId: schema.curatedListItems.listId,
      cover: schema.series.cover,
      sortOrder: schema.curatedListItems.sortOrder,
    })
    .from(schema.curatedListItems)
    .innerJoin(schema.series, eq(schema.curatedListItems.seriesId, schema.series.id))
    .where(and(inArray(schema.curatedListItems.listId, listIds), ...nsfwConditions))
    .orderBy(asc(schema.curatedListItems.sortOrder));

  for (const row of rows) {
    const url = resolveCoverUrl(row.cover);
    if (!url) continue;
    const existing = map.get(row.listId) ?? [];
    if (existing.length < 4) {
      existing.push(url);
      map.set(row.listId, existing);
    }
  }
  return map;
}

async function attachListMetadata<T extends { id: number }>(lists: T[], userId: string | null | undefined, hideNsfw: boolean) {
  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const previewMap = await fetchPreviewCovers(listIds, hideNsfw);

  let voteMap = new Map<number, string>();
  let savedSet = new Set<number>();

  if (userId) {
    const [votes, saves] = await Promise.all([
      db.select().from(schema.curatedListVotes).where(and(inArray(schema.curatedListVotes.listId, listIds), eq(schema.curatedListVotes.userId, userId))),
      db.select().from(schema.curatedListSaves).where(and(inArray(schema.curatedListSaves.listId, listIds), eq(schema.curatedListSaves.userId, userId))),
    ]);
    voteMap = new Map(votes.map((v) => [v.listId, v.type]));
    savedSet = new Set(saves.map((s) => s.listId));
  }

  return lists.map((list) => ({
    ...list,
    previewCovers: previewMap.get(list.id) ?? [],
    userVote: voteMap.get(list.id) ?? null,
    userSaved: savedSet.has(list.id),
  }));
}

function listSortOrder(sort: ListSort) {
  if (sort === 'popular') return [desc(sql`(${schema.curatedLists.likeCount} - ${schema.curatedLists.dislikeCount})`), desc(schema.curatedLists.viewCount)];
  if (sort === 'views') return [desc(schema.curatedLists.viewCount)];
  if (sort === 'title') return [asc(schema.curatedLists.title)];
  if (sort === 'itemCount') return [desc(schema.curatedLists.itemCount)];
  return [desc(schema.curatedLists.createdAt)];
}

class CuratedListService {
  async createList(userId: string, data: { title: string; description?: string; visibility?: ListVisibility }) {
    const title = data.title.trim();
    if (!title) throw new Error('Title is required');
    if (title.length > CONTENT_LIMITS.listTitle) throw new Error(`Title must be at most ${CONTENT_LIMITS.listTitle} characters`);

    const description = (data.description ?? '').trim();
    if (description.length > CONTENT_LIMITS.listDescription) throw new Error(`Description must be at most ${CONTENT_LIMITS.listDescription} characters`);

    const listCount = await db.select({ count: count() }).from(schema.curatedLists).where(eq(schema.curatedLists.userId, userId));
    if (Number(listCount[0]?.count ?? 0) >= CONTENT_LIMITS.importMaxLists) throw new Error(`You can create at most ${CONTENT_LIMITS.importMaxLists} lists`);

    const slug = await uniqueSlugForUser(userId, title);
    const [list] = await db.insert(schema.curatedLists).values({
      userId,
      title,
      slug,
      description,
      visibility: data.visibility === 'private' ? 'private' : 'public',
    }).returning();

    await karmaService.award({
      userId,
      action: 'list_create',
      sourceType: 'curated_list',
      sourceId: String(list.id),
      idempotencyKey: `list_create:${list.id}`,
    });

    return list;
  }

  async updateList(userId: string, listId: number, data: { title?: string; description?: string; visibility?: ListVisibility }) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || list.userId !== userId) throw new Error('List not found');

    const updates: Partial<typeof schema.curatedLists.$inferInsert> = { updatedAt: new Date() };
    if (data.title !== undefined) {
      const title = data.title.trim();
      if (!title) throw new Error('Title is required');
      if (title.length > CONTENT_LIMITS.listTitle) throw new Error(`Title must be at most ${CONTENT_LIMITS.listTitle} characters`);
      updates.title = title;
      if (title !== list.title) updates.slug = await uniqueSlugForUser(userId, title, listId);
    }
    if (data.description !== undefined) {
      const description = data.description.trim();
      if (description.length > CONTENT_LIMITS.listDescription) throw new Error(`Description must be at most ${CONTENT_LIMITS.listDescription} characters`);
      updates.description = description;
    }
    if (data.visibility !== undefined) updates.visibility = data.visibility === 'private' ? 'private' : 'public';

    const [updated] = await db.update(schema.curatedLists).set(updates).where(eq(schema.curatedLists.id, listId)).returning();
    return updated;
  }

  async deleteList(userId: string, listId: number) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || list.userId !== userId) throw new Error('List not found');
    await db.delete(schema.curatedLists).where(eq(schema.curatedLists.id, listId));
    await karmaService.reverse({
      userId: list.userId,
      action: 'list_create',
      sourceType: 'curated_list',
      sourceId: String(listId),
      originalIdempotencyKey: `list_create:${listId}`,
    }).catch(() => undefined);
  }

  async getDiscover(options: { search?: string; genres?: string[]; sort?: ListSort; limit?: number; offset?: number; userId?: string | null; hideNsfw?: boolean }) {
    const limit = Math.min(40, Math.max(1, options.limit ?? 20));
    const offset = Math.max(0, options.offset ?? 0);
    const sort = options.sort ?? 'popular';
    const conditions = [eq(schema.curatedLists.visibility, 'public')];

    if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.curatedLists.title, term),
          ilike(schema.curatedLists.description, term),
          sql`EXISTS (SELECT 1 FROM ${schema.user} u WHERE u.id = ${schema.curatedLists.userId} AND (u.username ILIKE ${term} OR u.name ILIKE ${term}))`
        )!
      );
    }

    if (options.genres && options.genres.length > 0) {
      for (const genre of options.genres) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM ${schema.curatedListItems} cli
            INNER JOIN ${schema.series} s ON s.id = cli.series_id
            WHERE cli.list_id = ${schema.curatedLists.id}
            AND s.genres @> ${JSON.stringify([genre])}::jsonb
          )`
        );
      }
    }

    const whereClause = and(...conditions);

    const [rows, totalRow] = await Promise.all([
      db.query.curatedLists.findMany({
        where: whereClause,
        with: { author: { columns: AUTHOR_COLUMNS } },
        orderBy: listSortOrder(sort),
        limit,
        offset,
      }),
      db.select({ count: count() }).from(schema.curatedLists).where(whereClause),
    ]);

    const enriched = await attachListMetadata(rows, options.userId, options.hideNsfw ?? false);
    const withAuthors = await enrichAuthors(enriched);

    return { lists: withAuthors, total: Number(totalRow[0]?.count ?? 0), limit, offset };
  }

  async getForSeries(seriesId: number, options: { limit?: number; userId?: string | null; hideNsfw?: boolean }) {
    const limit = Math.min(20, Math.max(1, options.limit ?? 12));
    const whereClause = and(
      eq(schema.curatedLists.visibility, 'public'),
      sql`EXISTS (SELECT 1 FROM ${schema.curatedListItems} cli WHERE cli.list_id = ${schema.curatedLists.id} AND cli.series_id = ${seriesId})`
    );

    const [rows, totalRow] = await Promise.all([
      db.query.curatedLists.findMany({
        where: whereClause,
        with: { author: { columns: AUTHOR_COLUMNS } },
        orderBy: listSortOrder('popular'),
        limit,
      }),
      db.select({ count: count() }).from(schema.curatedLists).where(whereClause),
    ]);

    const enriched = await attachListMetadata(rows, options.userId, options.hideNsfw ?? false);
    const withAuthors = await enrichAuthors(enriched);
    return { lists: withAuthors, total: Number(totalRow[0]?.count ?? 0), limit };
  }

  async getMine(userId: string, options: { sort?: ListSort; limit?: number; offset?: number; seriesId?: number }) {
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);
    const sort = options.sort ?? 'newest';

    const [rows, totalRow] = await Promise.all([
      db.query.curatedLists.findMany({
        where: eq(schema.curatedLists.userId, userId),
        with: { author: { columns: AUTHOR_COLUMNS } },
        orderBy: listSortOrder(sort),
        limit,
        offset,
      }),
      db.select({ count: count() }).from(schema.curatedLists).where(eq(schema.curatedLists.userId, userId)),
    ]);

    let containingSet = new Set<number>();
    if (options.seriesId && rows.length > 0) {
      const containing = await db
        .select({ listId: schema.curatedListItems.listId })
        .from(schema.curatedListItems)
        .where(and(eq(schema.curatedListItems.seriesId, options.seriesId), inArray(schema.curatedListItems.listId, rows.map((r) => r.id))));
      containingSet = new Set(containing.map((r) => r.listId));
    }

    const { hideNsfw } = await getUserSettings(userId);
    const enriched = await attachListMetadata(rows, userId, hideNsfw);
    const withAuthors = await enrichAuthors(enriched);
    const lists = withAuthors.map((list) => ({
      ...list,
      hasSeries: options.seriesId ? containingSet.has(list.id) : undefined,
    }));
    return { lists, total: Number(totalRow[0]?.count ?? 0), limit, offset };
  }

  async getSaved(userId: string, options: { sort?: ListSort; limit?: number; offset?: number }) {
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);
    const sort = options.sort ?? 'newest';

    const savedRows = await db
      .select({ listId: schema.curatedListSaves.listId })
      .from(schema.curatedListSaves)
      .where(eq(schema.curatedListSaves.userId, userId));

    const listIds = savedRows.map((r) => r.listId);
    if (listIds.length === 0) return { lists: [], total: 0, limit, offset };

    const whereClause = and(
      inArray(schema.curatedLists.id, listIds),
      or(eq(schema.curatedLists.visibility, 'public'), eq(schema.curatedLists.userId, userId))
    );

    const [rows, totalRow] = await Promise.all([
      db.query.curatedLists.findMany({
        where: whereClause,
        with: { author: { columns: AUTHOR_COLUMNS } },
        orderBy: listSortOrder(sort),
        limit,
        offset,
      }),
      db.select({ count: count() }).from(schema.curatedLists).where(whereClause),
    ]);

    const { hideNsfw } = await getUserSettings(userId);
    const enriched = await attachListMetadata(rows, userId, hideNsfw);
    const withAuthors = await enrichAuthors(enriched);
    return { lists: withAuthors, total: Number(totalRow[0]?.count ?? 0), limit, offset };
  }

  async canUserViewList(listId: number, userId?: string | null): Promise<boolean> {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId), columns: { id: true, visibility: true, userId: true } });
    return Boolean(list && canViewList(list, userId));
  }

  async getListDetail(listId: number, userId?: string | null, hideNsfw = false) {
    const list = await db.query.curatedLists.findFirst({
      where: eq(schema.curatedLists.id, listId),
      with: { author: { columns: AUTHOR_COLUMNS } },
    });
    if (!list || !canViewList(list, userId)) return null;

    const nsfwConditions = getCatalogFilterConditions(hideNsfw, schema.series);

    const itemConditions = [eq(schema.curatedListItems.listId, listId), ...nsfwConditions];

    const itemRows = await db
      .select({
        sortOrder: schema.curatedListItems.sortOrder,
        ...seriesCardColumns,
        views: schema.mangaViewStats.totalViews,
      })
      .from(schema.curatedListItems)
      .innerJoin(schema.series, eq(schema.curatedListItems.seriesId, schema.series.id))
      .leftJoin(schema.mangaViewStats, eq(schema.mangaViewStats.seriesId, schema.series.id))
      .where(and(...itemConditions))
      .orderBy(asc(schema.curatedListItems.sortOrder));

    const items = await enrichSeriesListExtras(
      itemRows.map((row) => ({
        id: row.id,
        titles: row.titles,
        cover: row.cover,
        type: row.type,
        status: row.status,
        rating: row.rating,
        views: row.views ?? 0,
        totalChapters: row.totalChapters,
        year: row.year,
        genres: row.genres as string[] | null,
        sortOrder: row.sortOrder,
      }))
    );

    const genreCounts = new Map<string, number>();
    for (const item of items) {
      const genres = (item as { genres?: string[] | null }).genres;
      if (!genres) continue;
      for (const g of genres) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
    }
    const genreTags = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));

    const previewCovers = items
      .map((item) => resolveCoverUrl(item.cover))
      .filter((url): url is string => Boolean(url))
      .slice(0, 4);

    let userVote: string | null = null;
    let userSaved = false;
    if (userId) {
      const [vote, save] = await Promise.all([
        db.query.curatedListVotes.findFirst({ where: and(eq(schema.curatedListVotes.listId, listId), eq(schema.curatedListVotes.userId, userId)) }),
        db.query.curatedListSaves.findFirst({ where: and(eq(schema.curatedListSaves.listId, listId), eq(schema.curatedListSaves.userId, userId)) }),
      ]);
      userVote = vote?.type ?? null;
      userSaved = Boolean(save);
    }

    const [enrichedList] = await enrichAuthors([list]);
    const viewStats = await metricsService.getListViewStats(listId);

    return {
      ...enrichedList,
      items,
      genreTags,
      previewCovers,
      userVote,
      userSaved,
      viewCount: viewStats?.totalViews ?? list.viewCount,
      isOwner: userId === list.userId,
    };
  }

  async addItem(userId: string, listId: number, seriesId: number) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || list.userId !== userId) throw new Error('List not found');
    if (list.itemCount >= CONTENT_LIMITS.importMaxListItemsPerList) throw new Error(`Lists can contain at most ${CONTENT_LIMITS.importMaxListItemsPerList} items`);

    const [seriesRow] = await db.select({ id: schema.series.id, type: schema.series.type }).from(schema.series).where(eq(schema.series.id, seriesId)).limit(1);
    if (!seriesRow) throw new Error('Manga not found');
    if (isNovelType(seriesRow.type)) throw new Error('Novels cannot be added to lists');

    const existing = await db.query.curatedListItems.findFirst({
      where: and(eq(schema.curatedListItems.listId, listId), eq(schema.curatedListItems.seriesId, seriesId)),
    });
    if (existing) throw new Error('Manga is already in this list');

    const [maxOrder] = await db
      .select({ maxOrder: max(schema.curatedListItems.sortOrder) })
      .from(schema.curatedListItems)
      .where(eq(schema.curatedListItems.listId, listId));

    await db.insert(schema.curatedListItems).values({
      listId,
      seriesId,
      sortOrder: (maxOrder?.maxOrder ?? -1) + 1,
    });

    await db.update(schema.curatedLists)
      .set({ itemCount: sql`${schema.curatedLists.itemCount} + 1`, updatedAt: new Date() })
      .where(eq(schema.curatedLists.id, listId));
  }

  async removeItem(userId: string, listId: number, seriesId: number) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || list.userId !== userId) throw new Error('List not found');

    const result = await db
      .delete(schema.curatedListItems)
      .where(and(eq(schema.curatedListItems.listId, listId), eq(schema.curatedListItems.seriesId, seriesId)))
      .returning();

    if (result.length > 0) {
      await db.update(schema.curatedLists)
        .set({ itemCount: sql`GREATEST(0, ${schema.curatedLists.itemCount} - 1)`, updatedAt: new Date() })
        .where(eq(schema.curatedLists.id, listId));
    }
  }

  async voteList(userId: string, listId: number, type: 'like' | 'dislike') {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || !canViewList(list, userId)) throw new Error('List not found');
    if (list.userId === userId) throw new Error('You cannot vote on your own list');

    const existing = await db.query.curatedListVotes.findFirst({
      where: and(eq(schema.curatedListVotes.listId, listId), eq(schema.curatedListVotes.userId, userId)),
    });

    if (!existing) {
      await db.insert(schema.curatedListVotes).values({ listId, userId, type });
      await db.update(schema.curatedLists).set({
        likeCount: type === 'like' ? sql`${schema.curatedLists.likeCount} + 1` : schema.curatedLists.likeCount,
        dislikeCount: type === 'dislike' ? sql`${schema.curatedLists.dislikeCount} + 1` : schema.curatedLists.dislikeCount,
        updatedAt: new Date(),
      }).where(eq(schema.curatedLists.id, listId));
      return { userVote: type };
    }

    if (existing.type === type) {
      await db.delete(schema.curatedListVotes).where(and(eq(schema.curatedListVotes.listId, listId), eq(schema.curatedListVotes.userId, userId)));
      await db.update(schema.curatedLists).set({
        likeCount: type === 'like' ? sql`GREATEST(0, ${schema.curatedLists.likeCount} - 1)` : schema.curatedLists.likeCount,
        dislikeCount: type === 'dislike' ? sql`GREATEST(0, ${schema.curatedLists.dislikeCount} - 1)` : schema.curatedLists.dislikeCount,
        updatedAt: new Date(),
      }).where(eq(schema.curatedLists.id, listId));
      return { userVote: null };
    }

    await db.update(schema.curatedListVotes).set({ type }).where(and(eq(schema.curatedListVotes.listId, listId), eq(schema.curatedListVotes.userId, userId)));
    await db.update(schema.curatedLists).set({
      likeCount: type === 'like'
        ? sql`${schema.curatedLists.likeCount} + 1`
        : sql`GREATEST(0, ${schema.curatedLists.likeCount} - 1)`,
      dislikeCount: type === 'dislike'
        ? sql`${schema.curatedLists.dislikeCount} + 1`
        : sql`GREATEST(0, ${schema.curatedLists.dislikeCount} - 1)`,
      updatedAt: new Date(),
    }).where(eq(schema.curatedLists.id, listId));
    return { userVote: type };
  }

  async saveList(userId: string, listId: number) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || !canViewList(list, userId)) throw new Error('List not found');
    if (list.userId === userId) throw new Error('You cannot save your own list');

    const existing = await db.query.curatedListSaves.findFirst({
      where: and(eq(schema.curatedListSaves.listId, listId), eq(schema.curatedListSaves.userId, userId)),
    });
    if (existing) return { userSaved: true };

    await db.insert(schema.curatedListSaves).values({ listId, userId });
    await db.update(schema.curatedLists)
      .set({ saveCount: sql`${schema.curatedLists.saveCount} + 1`, updatedAt: new Date() })
      .where(eq(schema.curatedLists.id, listId));
    badgeService.evaluateBadgesAsync(list.userId, 'list_save');
    return { userSaved: true };
  }

  async unsaveList(userId: string, listId: number) {
    const result = await db
      .delete(schema.curatedListSaves)
      .where(and(eq(schema.curatedListSaves.listId, listId), eq(schema.curatedListSaves.userId, userId)))
      .returning();

    if (result.length > 0) {
      await db.update(schema.curatedLists)
        .set({ saveCount: sql`GREATEST(0, ${schema.curatedLists.saveCount} - 1)`, updatedAt: new Date() })
        .where(eq(schema.curatedLists.id, listId));
    }
    return { userSaved: false };
  }

  async getComments(listId: number, options: { sort?: ListCommentSort; page?: number; limit?: number; userId?: string | null }) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || !canViewList(list, options.userId)) throw new Error('List not found');

    const sort = options.sort ?? 'recent';
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));

    const flat = await db.query.curatedListComments.findMany({
      where: and(eq(schema.curatedListComments.listId, listId), eq(schema.curatedListComments.isDeleted, false)),
      with: {
        author: { columns: AUTHOR_COLUMNS },
        votes: true,
      },
    });

    const tree = buildThreadTree(flat as any[]);
    const sorted = sortTopLevelComments(tree, sort);
    const total = sorted.length;
    const offset = (page - 1) * limit;
    const pageComments = sorted.slice(offset, offset + limit);
    const enriched = await enrichCommentsWithAuthorMeta(pageComments);

    return { comments: enriched, pagination: { page, limit, total, hasMore: offset + limit < total } };
  }

  async createComment(userId: string, listId: number, content: string, parentId?: number) {
    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || !canViewList(list, userId)) throw new Error('List not found');

    if (parentId) {
      const parent = await db.query.curatedListComments.findFirst({ where: eq(schema.curatedListComments.id, parentId) });
      if (!parent || parent.isDeleted) throw new Error('Parent comment not found');
      if (parent.listId !== listId) throw new Error('Parent comment belongs to a different list');
    }

    const [comment] = await db.insert(schema.curatedListComments).values({
      listId,
      userId,
      content: content.trim(),
      parentId: parentId ?? null,
    }).returning();

    await karmaService.award({
      userId,
      action: 'list_comment',
      sourceType: 'curated_list_comment',
      sourceId: String(comment.id),
      idempotencyKey: `list_comment:${comment.id}`,
    });

    if (parentId) {
      const parent = await db.query.curatedListComments.findFirst({ where: eq(schema.curatedListComments.id, parentId) });
      const [replier] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
      if (parent && parent.userId !== userId) {
        notificationService.notifyListCommentReply({
          recipientUserId: parent.userId,
          replierName: replier?.name || 'Someone',
          listId,
          listTitle: list.title,
        }).catch(() => undefined);
      }
      if (list.userId !== userId && parent?.userId !== list.userId) {
        notificationService.notifyListCommentReply({
          recipientUserId: list.userId,
          replierName: replier?.name || 'Someone',
          listId,
          listTitle: list.title,
        }).catch(() => undefined);
      }
    }

    return comment;
  }

  async deleteComment(userId: string, listId: number, commentId: number, isAdmin: boolean) {
    const comment = await db.query.curatedListComments.findFirst({ where: eq(schema.curatedListComments.id, commentId) });
    if (!comment || comment.listId !== listId || comment.isDeleted) throw new Error('Comment not found');
    if (comment.userId !== userId && !isAdmin) throw new Error('Forbidden');

    await db.update(schema.curatedListComments)
      .set({ isDeleted: true, deletedBy: userId, updatedAt: new Date() })
      .where(eq(schema.curatedListComments.id, commentId));

    if (comment.userId === userId) {
      await karmaService.reverse({
        userId: comment.userId,
        action: 'list_comment',
        sourceType: 'curated_list_comment',
        sourceId: String(commentId),
        originalIdempotencyKey: `list_comment:${commentId}`,
      }).catch(() => undefined);
    }
  }

  async voteComment(userId: string, listId: number, commentId: number, type: 'like' | 'dislike') {
    const comment = await db.query.curatedListComments.findFirst({ where: eq(schema.curatedListComments.id, commentId) });
    if (!comment || comment.isDeleted || comment.listId !== listId) throw new Error('Comment not found');

    const list = await db.query.curatedLists.findFirst({ where: eq(schema.curatedLists.id, listId) });
    if (!list || !canViewList(list, userId)) throw new Error('Comment not found');

    const existing = await db.query.curatedListCommentLikes.findFirst({
      where: and(eq(schema.curatedListCommentLikes.commentId, commentId), eq(schema.curatedListCommentLikes.userId, userId)),
    });

    if (!existing) {
      await db.insert(schema.curatedListCommentLikes).values({ commentId, userId, type });
      return;
    }
    if (existing.type === type) {
      await db.delete(schema.curatedListCommentLikes).where(and(eq(schema.curatedListCommentLikes.commentId, commentId), eq(schema.curatedListCommentLikes.userId, userId)));
      return;
    }
    await db.update(schema.curatedListCommentLikes).set({ type }).where(and(eq(schema.curatedListCommentLikes.commentId, commentId), eq(schema.curatedListCommentLikes.userId, userId)));
  }

  async searchMangaForList(query: string, limit = 10) {
    const term = query.trim();
    if (!term) return [];
    const rows = await db
      .select({
        id: schema.series.id,
        titles: schema.series.titles,
        cover: schema.series.cover,
      })
      .from(schema.series)
      .where(and(ilike(schema.series.searchText, `%${term}%`), ...getExcludeNovelConditions(schema.series)))
      .limit(Math.min(limit, 20));
    return rows.map((r) => {
      const resolved = withResolvedDisplayTitle(r);
      return { id: resolved.id, title: resolved.title, cover: resolveCoverUrl(resolved.cover) };
    });
  }
}

export const curatedListService = new CuratedListService();
