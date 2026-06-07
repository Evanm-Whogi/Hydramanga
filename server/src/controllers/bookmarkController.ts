import { Request, Response, NextFunction } from 'express';
import { BookmarkService, BOOKMARK_STATUSES, BookmarkStatus } from '@/services/bookmarkService';
import { karmaService } from '@/services/karmaService';
import { badgeService } from '@/services/badgeService';
import { recordAuditFromRequest } from '@/audit/record';

export async function getBookmarks(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.id;
    const statusParam = req.query.status;
    const typeParam = req.query.type;
    const status = statusParam
      ? (Array.isArray(statusParam) ? statusParam : [statusParam]).map(String).filter((s): s is BookmarkStatus => BOOKMARK_STATUSES.includes(s as BookmarkStatus))
      : undefined;
    const types = typeParam
      ? (Array.isArray(typeParam) ? typeParam : [typeParam]).map(String)
      : undefined;
    const sort = (req.query.sort as string) || 'bookmarked';
    const search = req.query.search as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit || '500'), 10) || 500, 500);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

    const result = await BookmarkService.getUserBookmarks(userId, {
      status,
      types,
      sort: ['updated', 'lastRead', 'bookmarked', 'title', 'ranking'].includes(sort) ? sort as any : 'bookmarked',
      search,
      limit,
      offset,
    });

    return res.json({ success: true, bookmarks: result.items, total: result.total });
  } catch (error) {
    return next(error);
  }
}

export async function setBookmark(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.id;
    const seriesId = parseInt(req.params.seriesId, 10);
    const { status } = req.body;

    if (isNaN(seriesId)) {
      return res.status(400).json({ success: false, message: 'Invalid series ID' });
    }
    if (!status || !BOOKMARK_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Valid status is required' });
    }

    const existing = await BookmarkService.getBookmarkStatus(userId, seriesId);
    const bookmark = await BookmarkService.setBookmark(userId, seriesId, status);

    if (!existing) {
      await karmaService.award({
        userId,
        action: 'bookmark_add',
        sourceType: 'series',
        sourceId: String(seriesId),
        idempotencyKey: `bookmark_add:${userId}:${seriesId}`,
      });
    }

    badgeService.evaluateBadgesAsync(userId, 'bookmark_change');

    recordAuditFromRequest(req, {
      action: existing ? 'bookmark.update' : 'bookmark.create',
      category: 'library',
      resourceType: 'series',
      resourceId: String(seriesId),
      metadata: { status },
    });

    return res.json({ success: true, bookmark });
  } catch (error) {
    return next(error);
  }
}

export async function removeBookmark(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.id;
    const seriesId = parseInt(req.params.seriesId, 10);

    if (isNaN(seriesId)) {
      return res.status(400).json({ success: false, message: 'Invalid series ID' });
    }

    await BookmarkService.removeBookmark(userId, seriesId);

    recordAuditFromRequest(req, {
      action: 'bookmark.delete',
      category: 'library',
      resourceType: 'series',
      resourceId: String(seriesId),
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}
