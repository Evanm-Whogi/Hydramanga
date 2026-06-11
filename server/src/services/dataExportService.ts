import { db, schema } from '@/db/index';
import { and, desc, eq, inArray, max, or, sql } from 'drizzle-orm';
import { CONTENT_LIMITS } from '@/lib/securityLimits';

export const DATA_EXPORT_VERSION = 3;

const IMPORT_VIEW_IP = 'import';
const IMPORT_VIEW_UA = 'mang-data-import';
const VALID_BOOKMARK_STATUSES = ['reading', 'rereading', 'planned', 'completed', 'paused', 'dropped'] as const;

type ExportListItem = { seriesId: number; sortOrder: number };
type ExportMyList = {
  title: string;
  slug: string;
  description: string;
  visibility: string;
  createdAt?: string;
  updatedAt?: string;
  items: ExportListItem[];
};
type ExportSavedList = {
  listId: number;
  title: string;
  slug: string;
  ownerUsername: string | null;
  savedAt?: string;
};

type ImportPayload = {
  version?: number;
  seriesBookmarks?: { seriesId: number; status: string }[];
  readingProgress?: {
    seriesId: number;
    lastChapterId?: number | null;
    lastPageNumber?: number;
    percentageCompleted?: number;
    totalPagesRead?: number;
    updatedAt?: string;
  }[];
  viewHistory?: { seriesId: number; viewedAt?: string }[];
  myLists?: ExportMyList[];
  savedLists?: ExportSavedList[];
};

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

async function uniqueSlugForUser(userId: string, title: string, preferredSlug?: string): Promise<string> {
  const base = preferredSlug?.trim() || slugify(title);
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await db.query.curatedLists.findFirst({
      where: and(eq(schema.curatedLists.userId, userId), eq(schema.curatedLists.slug, candidate)),
      columns: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

async function resolveSavedListId(entry: ExportSavedList, userId: string): Promise<number | null> {
  if (entry.listId) {
    const byId = await db.query.curatedLists.findFirst({
      where: eq(schema.curatedLists.id, entry.listId),
      columns: { id: true, userId: true },
    });
    if (byId && byId.userId !== userId) return byId.id;
  }

  if (!entry.ownerUsername || !entry.slug) return null;

  const [owner] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(or(eq(schema.user.username, entry.ownerUsername), eq(schema.user.displayUsername, entry.ownerUsername)))
    .limit(1);
  if (!owner) return null;

  const bySlug = await db.query.curatedLists.findFirst({
    where: and(eq(schema.curatedLists.userId, owner.id), eq(schema.curatedLists.slug, entry.slug)),
    columns: { id: true, userId: true, visibility: true },
  });
  if (!bySlug || bySlug.userId === userId) return null;
  if (bySlug.visibility !== 'public') return null;
  return bySlug.id;
}

class DataExportService {
  async exportUserData(userId: string) {
    const [seriesBookmarks, progress, viewHistoryRows, myListRows, savedListRows] = await Promise.all([
      db
        .select({
          seriesId: schema.seriesBookmarks.seriesId,
          status: schema.seriesBookmarks.status,
          createdAt: schema.seriesBookmarks.createdAt,
          updatedAt: schema.seriesBookmarks.updatedAt,
        })
        .from(schema.seriesBookmarks)
        .where(eq(schema.seriesBookmarks.userId, userId)),
      db
        .select({
          seriesId: schema.userReadingProgress.seriesId,
          lastChapterId: schema.userReadingProgress.lastChapterId,
          lastPageNumber: schema.userReadingProgress.lastPageNumber,
          percentageCompleted: schema.userReadingProgress.percentageCompleted,
          totalPagesRead: schema.userReadingProgress.totalPagesRead,
          updatedAt: schema.userReadingProgress.updatedAt,
        })
        .from(schema.userReadingProgress)
        .where(eq(schema.userReadingProgress.userId, userId)),
      db
        .select({
          seriesId: schema.mangaViews.seriesId,
          viewedAt: max(schema.mangaViews.viewedAt).as('viewedAt'),
        })
        .from(schema.mangaViews)
        .where(eq(schema.mangaViews.userId, userId))
        .groupBy(schema.mangaViews.seriesId)
        .orderBy(desc(max(schema.mangaViews.viewedAt))),
      db.query.curatedLists.findMany({
        where: eq(schema.curatedLists.userId, userId),
        orderBy: [desc(schema.curatedLists.updatedAt)],
        columns: {
          title: true,
          slug: true,
          description: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db
        .select({
          listId: schema.curatedListSaves.listId,
          savedAt: schema.curatedListSaves.createdAt,
          title: schema.curatedLists.title,
          slug: schema.curatedLists.slug,
          ownerUsername: schema.user.username,
        })
        .from(schema.curatedListSaves)
        .innerJoin(schema.curatedLists, eq(schema.curatedListSaves.listId, schema.curatedLists.id))
        .innerJoin(schema.user, eq(schema.curatedLists.userId, schema.user.id))
        .where(eq(schema.curatedListSaves.userId, userId)),
    ]);

    const listSlugs = myListRows.map((l) => l.slug);
    const listItemsBySlug = new Map<string, ExportListItem[]>();

    if (listSlugs.length > 0) {
      const listsWithIds = await db
        .select({ id: schema.curatedLists.id, slug: schema.curatedLists.slug })
        .from(schema.curatedLists)
        .where(and(eq(schema.curatedLists.userId, userId), inArray(schema.curatedLists.slug, listSlugs)));

      const slugByListId = new Map(listsWithIds.map((l) => [l.id, l.slug]));
      const listIds = listsWithIds.map((l) => l.id);

      if (listIds.length > 0) {
        const itemRows = await db
          .select({
            listId: schema.curatedListItems.listId,
            seriesId: schema.curatedListItems.seriesId,
            sortOrder: schema.curatedListItems.sortOrder,
          })
          .from(schema.curatedListItems)
          .where(inArray(schema.curatedListItems.listId, listIds))
          .orderBy(schema.curatedListItems.sortOrder);

        for (const row of itemRows) {
          const slug = slugByListId.get(row.listId);
          if (!slug) continue;
          const items = listItemsBySlug.get(slug) ?? [];
          items.push({ seriesId: row.seriesId, sortOrder: row.sortOrder });
          listItemsBySlug.set(slug, items);
        }
      }
    }

    return {
      version: DATA_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      seriesBookmarks: seriesBookmarks.map((b) => ({
        seriesId: b.seriesId,
        status: b.status,
        createdAt: b.createdAt?.toISOString(),
        updatedAt: b.updatedAt?.toISOString(),
      })),
      readingProgress: progress.map((p) => ({
        seriesId: p.seriesId,
        lastChapterId: p.lastChapterId,
        lastPageNumber: p.lastPageNumber,
        percentageCompleted: p.percentageCompleted,
        totalPagesRead: p.totalPagesRead,
        updatedAt: p.updatedAt?.toISOString(),
      })),
      viewHistory: viewHistoryRows.map((v) => ({
        seriesId: v.seriesId,
        viewedAt: v.viewedAt ? new Date(v.viewedAt).toISOString() : undefined,
      })),
      myLists: myListRows.map((list) => ({
        title: list.title,
        slug: list.slug,
        description: list.description,
        visibility: list.visibility,
        createdAt: list.createdAt?.toISOString(),
        updatedAt: list.updatedAt?.toISOString(),
        items: listItemsBySlug.get(list.slug) ?? [],
      })),
      savedLists: savedListRows.map((s) => ({
        listId: s.listId,
        title: s.title,
        slug: s.slug,
        ownerUsername: s.ownerUsername,
        savedAt: s.savedAt?.toISOString(),
      })),
    };
  }

  async importUserData(userId: string, payload: ImportPayload) {
    if ((payload.seriesBookmarks?.length ?? 0) > CONTENT_LIMITS.importMaxBookmarks) {
      throw new Error('Too many bookmarks in import');
    }
    if ((payload.readingProgress?.length ?? 0) > CONTENT_LIMITS.importMaxProgressRows) {
      throw new Error('Too much reading progress in import');
    }
    if ((payload.viewHistory?.length ?? 0) > CONTENT_LIMITS.importMaxViewHistory) {
      throw new Error('Too much view history in import');
    }
    if ((payload.myLists?.length ?? 0) > CONTENT_LIMITS.importMaxLists) {
      throw new Error('Too many lists in import');
    }
    if ((payload.savedLists?.length ?? 0) > CONTENT_LIMITS.importMaxLists) {
      throw new Error('Too many saved lists in import');
    }

    for (const list of payload.myLists ?? []) {
      if ((list.items?.length ?? 0) > CONTENT_LIMITS.importMaxListItemsPerList) {
        throw new Error('Too many items in a list');
      }
    }

    if (payload.seriesBookmarks?.length) {
      for (const b of payload.seriesBookmarks) {
        if (!b.seriesId || !VALID_BOOKMARK_STATUSES.includes(b.status as typeof VALID_BOOKMARK_STATUSES[number])) continue;
        await db
          .insert(schema.seriesBookmarks)
          .values({ userId, seriesId: b.seriesId, status: b.status as typeof VALID_BOOKMARK_STATUSES[number] })
          .onConflictDoUpdate({
            target: [schema.seriesBookmarks.userId, schema.seriesBookmarks.seriesId],
            set: { status: b.status as typeof VALID_BOOKMARK_STATUSES[number], updatedAt: new Date() },
          });
      }
    }

    if (payload.readingProgress?.length) {
      for (const p of payload.readingProgress) {
        if (!p.seriesId) continue;
        const updatedAt = p.updatedAt ? new Date(p.updatedAt) : new Date();
        await db
          .insert(schema.userReadingProgress)
          .values({
            userId,
            seriesId: p.seriesId,
            lastChapterId: p.lastChapterId ?? null,
            lastPageNumber: p.lastPageNumber ?? 0,
            percentageCompleted: p.percentageCompleted ?? 0,
            totalPagesRead: p.totalPagesRead ?? 0,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: [schema.userReadingProgress.userId, schema.userReadingProgress.seriesId],
            set: {
              lastChapterId: p.lastChapterId ?? null,
              lastPageNumber: p.lastPageNumber ?? 0,
              percentageCompleted: p.percentageCompleted ?? 0,
              totalPagesRead: p.totalPagesRead ?? 0,
              updatedAt,
            },
          });
      }
    }

    if (payload.viewHistory?.length) {
      for (const v of payload.viewHistory) {
        if (!v.seriesId) continue;
        const viewedAt = v.viewedAt ? new Date(v.viewedAt) : new Date();
        await db.insert(schema.mangaViews).values({
          seriesId: v.seriesId,
          userId,
          ipAddress: IMPORT_VIEW_IP,
          userAgent: IMPORT_VIEW_UA,
          viewedAt,
        });
      }
    }

    if (payload.myLists?.length) {
      const existingLists = await db.query.curatedLists.findMany({
        where: eq(schema.curatedLists.userId, userId),
        columns: { id: true, slug: true },
      });
      const existingBySlug = new Map(existingLists.map((l) => [l.slug, l.id]));

      const currentCount = existingLists.length;
      let createdCount = 0;

      for (const list of payload.myLists) {
        const title = list.title?.trim();
        if (!title || title.length > CONTENT_LIMITS.listTitle) continue;

        const description = (list.description ?? '').trim();
        if (description.length > CONTENT_LIMITS.listDescription) continue;

        const visibility = list.visibility === 'private' ? 'private' : 'public';
        let listId = list.slug ? existingBySlug.get(list.slug) : undefined;

        if (!listId) {
          if (currentCount + createdCount >= CONTENT_LIMITS.importMaxLists) continue;
          const slug = await uniqueSlugForUser(userId, title, list.slug);
          const [created] = await db.insert(schema.curatedLists).values({
            userId,
            title,
            slug,
            description,
            visibility,
          }).returning({ id: schema.curatedLists.id, slug: schema.curatedLists.slug });
          listId = created.id;
          existingBySlug.set(created.slug, created.id);
          createdCount += 1;
        } else {
          await db.update(schema.curatedLists).set({
            title,
            description,
            visibility,
            updatedAt: new Date(),
          }).where(eq(schema.curatedLists.id, listId));
        }

        const items = list.items ?? [];
        if (items.length === 0) continue;

        const seriesIds = [...new Set(items.map((i) => i.seriesId).filter((id) => Number.isInteger(id) && id > 0))];
        if (seriesIds.length === 0) continue;

        const existingSeries = await db
          .select({ id: schema.series.id })
          .from(schema.series)
          .where(inArray(schema.series.id, seriesIds));
        const validSeriesIds = new Set(existingSeries.map((r) => r.id));

        let addedItems = 0;
        for (const item of items) {
          if (!validSeriesIds.has(item.seriesId)) continue;
          const result = await db
            .insert(schema.curatedListItems)
            .values({ listId, seriesId: item.seriesId, sortOrder: item.sortOrder ?? 0 })
            .onConflictDoUpdate({
              target: [schema.curatedListItems.listId, schema.curatedListItems.seriesId],
              set: { sortOrder: item.sortOrder ?? 0 },
            })
            .returning({ listId: schema.curatedListItems.listId });
          if (result.length > 0) addedItems += 1;
        }

        if (addedItems > 0) {
          const [countRow] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(schema.curatedListItems)
            .where(eq(schema.curatedListItems.listId, listId));
          await db.update(schema.curatedLists).set({
            itemCount: Number(countRow?.count ?? 0),
            updatedAt: new Date(),
          }).where(eq(schema.curatedLists.id, listId));
        }
      }
    }

    if (payload.savedLists?.length) {
      for (const entry of payload.savedLists) {
        const listId = await resolveSavedListId(entry, userId);
        if (!listId) continue;

        const existing = await db.query.curatedListSaves.findFirst({
          where: and(eq(schema.curatedListSaves.listId, listId), eq(schema.curatedListSaves.userId, userId)),
        });
        if (existing) continue;

        await db.insert(schema.curatedListSaves).values({
          listId,
          userId,
          createdAt: entry.savedAt ? new Date(entry.savedAt) : new Date(),
        });
        await db.update(schema.curatedLists)
          .set({ saveCount: sql`${schema.curatedLists.saveCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.curatedLists.id, listId));
      }
    }
  }
}

export const dataExportService = new DataExportService();
