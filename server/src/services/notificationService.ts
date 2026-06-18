import { db, schema } from '@/db/index';
import { eq, and, desc, ilike } from 'drizzle-orm';
import type { ImportRequestStatus } from '@/services/importRequestService';
import { resolveCoverUrl } from '@/lib/coverUtils';

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
      .where(ilike(schema.series.title, title))
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
