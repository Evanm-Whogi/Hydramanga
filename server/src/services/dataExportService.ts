import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';

export const DATA_EXPORT_VERSION = 1;

class DataExportService {
  async exportUserData(userId: string) {
    const bookmarks = await db
      .select({
        chapterId: schema.bookmarks.chapterId,
        note: schema.bookmarks.note,
        createdAt: schema.bookmarks.createdAt,
      })
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, userId));

    const lists = await db.query.userLists.findMany({
      where: eq(schema.userLists.userId, userId),
      with: {
        items: {
          columns: { seriesId: true, updatedAt: true },
        },
      },
    });

    const progress = await db
      .select({
        seriesId: schema.userReadingProgress.seriesId,
        lastChapterId: schema.userReadingProgress.lastChapterId,
        percentageCompleted: schema.userReadingProgress.percentageCompleted,
        totalPagesRead: schema.userReadingProgress.totalPagesRead,
        updatedAt: schema.userReadingProgress.updatedAt,
      })
      .from(schema.userReadingProgress)
      .where(eq(schema.userReadingProgress.userId, userId));

    const views = await db
      .select({
        seriesId: schema.mangaViews.seriesId,
        viewedAt: schema.mangaViews.viewedAt,
      })
      .from(schema.mangaViews)
      .where(eq(schema.mangaViews.userId, userId));

    return {
      version: DATA_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      bookmarks: bookmarks.map((b) => ({
        chapterId: b.chapterId,
        note: b.note,
        createdAt: b.createdAt?.toISOString(),
      })),
      lists: lists.map((l) => ({
        name: l.name,
        slug: l.slug,
        isDefault: l.isDefault,
        isVisible: l.isVisible,
        sortOrder: l.sortOrder,
        items: l.items.map((i) => ({ seriesId: i.seriesId, addedAt: i.updatedAt?.toISOString() })),
      })),
      readingProgress: progress.map((p) => ({
        seriesId: p.seriesId,
        lastChapterId: p.lastChapterId,
        percentageCompleted: p.percentageCompleted,
        totalPagesRead: p.totalPagesRead,
        updatedAt: p.updatedAt?.toISOString(),
      })),
      viewHistory: views.map((v) => ({
        seriesId: v.seriesId,
        viewedAt: v.viewedAt?.toISOString(),
      })),
    };
  }

  async importUserData(userId: string, payload: {
    version?: number;
    bookmarks?: { chapterId: number; note?: string | null }[];
    lists?: {
      name: string;
      slug?: string | null;
      isDefault?: boolean;
      isVisible?: boolean;
      sortOrder?: number;
      items?: { seriesId: number }[];
    }[];
    readingProgress?: {
      seriesId: number;
      lastChapterId?: number | null;
      percentageCompleted?: number;
      totalPagesRead?: number;
    }[];
  }) {
    if (payload.bookmarks?.length) {
      for (const b of payload.bookmarks) {
        if (!b.chapterId) continue;
        await db
          .insert(schema.bookmarks)
          .values({ userId, chapterId: b.chapterId, note: b.note ?? null })
          .onConflictDoNothing();
      }
    }

    if (payload.lists?.length) {
      for (const list of payload.lists) {
        const slug =
          list.slug ||
          list.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 50);

        const [inserted] = await db
          .insert(schema.userLists)
          .values({
            userId,
            name: list.name,
            slug,
            isDefault: list.isDefault ?? false,
            isVisible: list.isVisible ?? true,
            sortOrder: list.sortOrder ?? 0,
          })
          .onConflictDoNothing({ target: [schema.userLists.userId, schema.userLists.slug] })
          .returning();

        const listId =
          inserted?.id ??
          (
            await db.query.userLists.findFirst({
              where: (t, { and, eq: e }) => and(e(t.userId, userId), e(t.slug, slug)),
              columns: { id: true },
            })
          )?.id;

        if (!listId || !list.items?.length) continue;

        for (const item of list.items) {
          if (!item.seriesId) continue;
          await db
            .insert(schema.userSeriesList)
            .values({ userId, listId, seriesId: item.seriesId })
            .onConflictDoNothing({ target: [schema.userSeriesList.userId, schema.userSeriesList.seriesId] });
        }
      }
    }

    if (payload.readingProgress?.length) {
      for (const p of payload.readingProgress) {
        if (!p.seriesId) continue;
        await db
          .insert(schema.userReadingProgress)
          .values({
            userId,
            seriesId: p.seriesId,
            lastChapterId: p.lastChapterId ?? null,
            percentageCompleted: p.percentageCompleted ?? 0,
            totalPagesRead: p.totalPagesRead ?? 0,
          })
          .onConflictDoUpdate({
            target: [schema.userReadingProgress.userId, schema.userReadingProgress.seriesId],
            set: {
              lastChapterId: p.lastChapterId ?? null,
              percentageCompleted: p.percentageCompleted ?? 0,
              totalPagesRead: p.totalPagesRead ?? 0,
              updatedAt: new Date(),
            },
          });
      }
    }
  }
}

export const dataExportService = new DataExportService();
