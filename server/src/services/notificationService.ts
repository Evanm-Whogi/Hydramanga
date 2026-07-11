import { db, schema } from '@/db/index';
import { eq, and, desc, ilike, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import type { ImportRequestStatus } from '@/services/importRequestService';
import { resolveCoverUrl } from '@/lib/coverUtils';
import { resolveDisplayTitle } from '@/lib/displayTitle';
import { discordService } from '@/services/discordService';
import { invalidateCatalogCaches } from '@/lib/catalogCache';
import { ChapterNumberParser } from '@/utils/chapterNumberParser';
import logger from '@/services/loggerService';

export type NotificationType =
  | 'import_request_status'
  | 'comment_reply'
  | 'board_reply'
  | 'list_comment_reply'
  | 'new_chapters';

export interface NotificationRow {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl: string;
  imageUrl: string | null;
  createdAt: Date;
}

const IMPORT_STATUS_TITLES: Record<ImportRequestStatus, string> = {
  pending: 'Import request pending',
  in_progress: 'Import request approved',
  completed: 'Import request completed',
  rejected: 'Import request rejected',
};

const IMPORT_STATUS_MESSAGES: Record<ImportRequestStatus, (title: string) => string> = {
  pending: (title) => `Your request for "${title}" is pending review.`,
  in_progress: (title) => `Your request for "${title}" has been approved and is being imported.`,
  completed: (title) => `Your request for "${title}" has been completed.`,
  rejected: (title) => `Your request for "${title}" was rejected.`,
};

class NotificationService {
  private async getSeriesCoverUrl(seriesId: number): Promise<string | null> {
    const [row] = await db
      .select({ cover: schema.series.cover })
      .from(schema.series)
      .where(eq(schema.series.id, seriesId))
      .limit(1);
    return resolveCoverUrl(row?.cover);
  }

  /** Cover for import requests: prefer linked series, else match catalog by requested title. */
  private async resolveImportRequestImageUrl(seriesId: number | null | undefined, requestedTitle: string): Promise<string | null> {
    if (seriesId != null) {
      const url = await this.getSeriesCoverUrl(seriesId);
      if (url) return url;
    }

    const title = requestedTitle.trim();
    if (!title) return null;

    const [match] = await db
      .select({ cover: schema.series.cover })
      .from(schema.series)
      .where(ilike(schema.series.searchText, title))
      .limit(1);

    return resolveCoverUrl(match?.cover);
  }

  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    linkUrl: string;
    imageUrl?: string | null;
  }): Promise<void> {
    await db.insert(schema.userNotifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl,
      imageUrl: params.imageUrl ?? null,
    });
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationRow[]> {
    const rows = await db
      .select({
        id: schema.userNotifications.id,
        type: schema.userNotifications.type,
        title: schema.userNotifications.title,
        message: schema.userNotifications.message,
        linkUrl: schema.userNotifications.linkUrl,
        imageUrl: schema.userNotifications.imageUrl,
        createdAt: schema.userNotifications.createdAt,
      })
      .from(schema.userNotifications)
      .where(eq(schema.userNotifications.userId, userId))
      .orderBy(desc(schema.userNotifications.createdAt))
      .limit(limit);

    return rows as NotificationRow[];
  }

  async dismiss(userId: string, notificationId: number): Promise<boolean> {
    const result = await db
      .delete(schema.userNotifications)
      .where(
        and(
          eq(schema.userNotifications.id, notificationId),
          eq(schema.userNotifications.userId, userId)
        )
      )
      .returning({ id: schema.userNotifications.id });

    return result.length > 0;
  }

  async clearAll(userId: string): Promise<number> {
    const result = await db
      .delete(schema.userNotifications)
      .where(eq(schema.userNotifications.userId, userId))
      .returning({ id: schema.userNotifications.id });

    return result.length;
  }

  async notifyImportRequestStatus(params: {userId: string; requestedTitle: string; status: ImportRequestStatus; seriesId?: number | null}): Promise<void> {
    const title = IMPORT_STATUS_TITLES[params.status];
    const message = IMPORT_STATUS_MESSAGES[params.status](params.requestedTitle);
    const imageUrl = await this.resolveImportRequestImageUrl(
      params.seriesId,
      params.requestedTitle
    );

    await this.create({
      userId: params.userId,
      type: 'import_request_status',
      title,
      message,
      linkUrl: '/request',
      imageUrl,
    });
  }

  async notifyCommentReply(params: {recipientUserId: string; replierName: string; seriesId: number; seriesTitle: string}): Promise<void> {
    const imageUrl = await this.getSeriesCoverUrl(params.seriesId);

    await this.create({
      userId: params.recipientUserId,
      type: 'comment_reply',
      title: 'New comment reply',
      message: `${params.replierName} replied to your comment on ${params.seriesTitle}.`,
      linkUrl: `/manga/${params.seriesId}`,
      imageUrl,
    });
  }

  async notifyBoardReply(params: {recipientUserId: string; replierName: string; postTitle: string; postId: number}): Promise<void> {
    await this.create({
      userId: params.recipientUserId,
      type: 'board_reply',
      title: 'New board reply',
      message: `${params.replierName} replied on "${params.postTitle}".`,
      linkUrl: `/forum/${params.postId}`,
      imageUrl: null,
    });
  }

  async notifyListCommentReply(params: {recipientUserId: string; replierName: string; listId: number; listTitle: string}): Promise<void> {
    await this.create({
      userId: params.recipientUserId,
      type: 'list_comment_reply',
      title: 'New list comment',
      message: `${params.replierName} replied on your list "${params.listTitle}".`,
      linkUrl: `/lists/${params.listId}`,
      imageUrl: null,
    });
  }

  /**
   * Announce the chapters that have finished downloading for a series but haven't been
   * announced yet, then mark them announced. Called when a series import completes, so
   * notifications reflect chapters that actually downloaded rather than ones merely
   * queued. Idempotent via `chapters.notifiedAt`: re-running (e.g. after a failed
   * download is recovered) only announces chapters not already announced, so recovery
   * cycles never re-spam users/Discord.
   */
  async announceNewlyDownloadedChapters(seriesId: number): Promise<void> {
    try {
      const pending = await db
        .select({ id: schema.chapters.id, chapterNumber: schema.chapters.chapterNumber })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.seriesId, seriesId), isNull(schema.chapters.notifiedAt)));

      if (pending.length === 0) return;

      // First announcement for this series (a brand-new import) vs. chapters added to an
      // already-announced series. Determines the Discord embed style.
      const [{ count: announcedCount } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.seriesId, seriesId), isNotNull(schema.chapters.notifiedAt)));
      const isFirstImport = announcedCount === 0;

      const [seriesRow] = await db
        .select({ titles: schema.series.titles, cover: schema.series.cover })
        .from(schema.series)
        .where(eq(schema.series.id, seriesId))
        .limit(1);

      if (!seriesRow) {
        logger.warn(`announceNewlyDownloadedChapters: series ${seriesId} not found`, { service: 'notificationService' });
        return;
      }

      const mangaTitle = resolveDisplayTitle(seriesRow);
      const chapterCount = pending.length;
      const chapterRange = ChapterNumberParser.formatRange(pending.map((c) => c.chapterNumber));
      const coverUrl = resolveCoverUrl(seriesRow.cover) ?? undefined;

      // Discord (public channel)
      if (isFirstImport) {
        await discordService.notifyMangaImported(mangaTitle, seriesId, chapterCount, chapterRange, coverUrl);
      } else {
        await discordService.notifyChaptersAdded(mangaTitle, seriesId, chapterCount, chapterRange, coverUrl);
      }

      // Site notifications to users with the series in their library
      const libraryUsers = await db
        .select({ userId: schema.seriesBookmarks.userId })
        .from(schema.seriesBookmarks)
        .where(and(
          eq(schema.seriesBookmarks.seriesId, seriesId),
          inArray(schema.seriesBookmarks.status, ['reading', 'rereading']),
        ));
      const userIds = [...new Set(libraryUsers.map((row) => row.userId))];

      if (userIds.length > 0) {
        await this.notifyNewChapters({
          userIds,
          seriesId,
          mangaTitle,
          chapterCount,
          chapterRange,
          imageUrl: coverUrl ?? null,
        });
      }

      // Mark announced only after sending, so a transient send failure doesn't
      // permanently suppress these chapters. The `isNull` guard keeps it idempotent if a
      // later import completion re-runs this for the same series. Announce runs once per
      // completion (the atomic increment elects a single completing chapter), so there is
      // no concurrent second call to double-send before this mark lands.
      const pendingIds = pending.map((c) => c.id);
      await db
        .update(schema.chapters)
        .set({ notifiedAt: new Date() })
        .where(and(inArray(schema.chapters.id, pendingIds), isNull(schema.chapters.notifiedAt)));

      // When a series gains chapters for the first time (or again after a purge) it now
      // belongs in the discover "Imported" filter, whose membership is held in the
      // never-expiring catalog skeleton cache. Only the 0→N transition changes that
      // membership, so gate on isFirstImport to avoid churning the whole catalog cache on
      // every incremental rescan of an already-imported series.
      if (isFirstImport) {
        await invalidateCatalogCaches();
      }

      logger.info(
        `Announced ${chapterCount} downloaded chapter(s) for series ${seriesId} (${isFirstImport ? 'first import' : 'chapters added'})`,
        { service: 'notificationService' }
      );
    } catch (error) {
      logger.error(`Failed to announce downloaded chapters for series ${seriesId}: ${error}`, { service: 'notificationService' });
    }
  }

  async notifyNewChapters(params: {userIds: string[]; seriesId: number; mangaTitle: string; chapterCount: number; chapterRange: string; imageUrl?: string | null}): Promise<void> {
    if (params.userIds.length === 0) return;

    const imageUrl = params.imageUrl ?? (await this.getSeriesCoverUrl(params.seriesId));

    const chapterLabel =
      params.chapterCount === 1 ? 'chapter' : 'chapters';
    const message = `${params.chapterCount} new ${chapterLabel} (${params.chapterRange}) were added to ${params.mangaTitle}.`;

    await db.insert(schema.userNotifications).values(
      params.userIds.map((userId) => ({
        userId,
        type: 'new_chapters' as const,
        title: 'New chapters',
        message,
        linkUrl: `/manga/${params.seriesId}`,
        imageUrl,
      }))
    );
  }
}

export const notificationService = new NotificationService();
