import { Request, Response, NextFunction } from 'express';
import logger from '@/services/loggerService';
import { curatedListService, type ListSort, type ListCommentSort } from '@/services/curatedListService';
import { metricsService } from '@/services/metricsService';
import { emailService } from '@/services/emailService';
import { recordAuditFromRequest } from '@/audit/record';
import { contentAuditMeta } from '@/audit/metadataHelpers';
import { isAdminRole } from '@/lib/authHelpers';
import { normalizeUserContent } from '@/lib/normalizeUserContent';
import { CONTENT_LIMITS, exceedsLimit } from '@/lib/securityLimits';
import { validateContentImagesAsync } from '@/lib/externalImageValidation';
import { getUserSettings, resolveHideNsfw } from '@/services/userSettingsService';

const LIST_SORTS: ListSort[] = ['popular', 'views', 'newest', 'title', 'itemCount'];
const COMMENT_SORTS: ListCommentSort[] = ['recent', 'oldest', 'top', 'worst'];

const LIST_REPORT_LABELS: Record<string, string> = {
  spam: 'Spam',
  wrong_content: 'Wrong Content',
  copyright: 'Copyright',
  other: 'Other',
};

function parseGenres(param: unknown): string[] {
  if (!param) return [];
  return (Array.isArray(param) ? param : String(param).split(',')).map((v) => v.trim()).filter(Boolean);
}

function getUserId(req: Request): string | undefined {
  return (req as Request & { user?: { id: string } }).user?.id;
}

export async function discoverLists(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const sort = LIST_SORTS.includes(req.query.sort as ListSort) ? (req.query.sort as ListSort) : 'popular';
    const limit = Math.min(40, parseInt(String(req.query.limit || '20'), 10) || 20);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const result = await curatedListService.getDiscover({
      search: req.query.search as string | undefined,
      genres: parseGenres(req.query.genres),
      sort,
      limit,
      offset,
      userId: getUserId(req),
      hideNsfw: await resolveHideNsfw(req),
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getMyLists(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const sort = LIST_SORTS.includes(req.query.sort as ListSort) ? (req.query.sort as ListSort) : 'newest';
    const limit = Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const seriesId = parseInt(String(req.query.seriesId || ''), 10);
    const result = await curatedListService.getMine(req.user!.id, {
      sort,
      limit,
      offset,
      seriesId: !isNaN(seriesId) ? seriesId : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getSavedLists(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const sort = LIST_SORTS.includes(req.query.sort as ListSort) ? (req.query.sort as ListSort) : 'newest';
    const limit = Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const result = await curatedListService.getSaved(req.user!.id, { sort, limit, offset });
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function createList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { title, description, visibility } = req.body || {};
    const list = await curatedListService.createList(req.user!.id, { title, description, visibility });
    recordAuditFromRequest(req, {
      action: 'curated_list.create',
      category: 'social',
      resourceType: 'curated_list',
      resourceId: String(list.id),
      metadata: contentAuditMeta({ href: `/lists/${list.id}`, summary: `Created list "${list.title}"`, title: list.title }),
    });
    return res.status(201).json({ success: true, list });
  } catch (error: any) {
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function getListDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    const list = await curatedListService.getListDetail(listId, getUserId(req), await resolveHideNsfw(req));
    if (!list) return res.status(404).json({ message: 'List not found' });
    return res.json({ success: true, list });
  } catch (error) {
    return next(error);
  }
}

export async function updateList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    const { title, description, visibility } = req.body || {};
    const list = await curatedListService.updateList(req.user!.id, listId, { title, description, visibility });
    recordAuditFromRequest(req, {
      action: 'curated_list.update',
      category: 'social',
      resourceType: 'curated_list',
      resourceId: String(listId),
      metadata: contentAuditMeta({ href: `/lists/${listId}`, summary: `Updated list "${list.title}"`, title: list.title }),
    });
    return res.json({ success: true, list });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function deleteList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    await curatedListService.deleteList(req.user!.id, listId);
    recordAuditFromRequest(req, {
      action: 'curated_list.delete',
      category: 'social',
      resourceType: 'curated_list',
      resourceId: String(listId),
    });
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    return next(error);
  }
}

export async function addListItem(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const seriesId = parseInt(req.body?.seriesId, 10);
    if (isNaN(listId) || isNaN(seriesId)) return res.status(400).json({ message: 'Invalid list or series ID' });
    await curatedListService.addItem(req.user!.id, listId, seriesId);
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function removeListItem(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const seriesId = parseInt(req.params.seriesId, 10);
    if (isNaN(listId) || isNaN(seriesId)) return res.status(400).json({ message: 'Invalid list or series ID' });
    await curatedListService.removeItem(req.user!.id, listId, seriesId);
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    return next(error);
  }
}

export async function voteList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const { type } = req.body || {};
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    if (!['like', 'dislike'].includes(type)) return res.status(400).json({ message: 'Type must be like or dislike' });
    const result = await curatedListService.voteList(req.user!.id, listId, type);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function saveList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    const result = await curatedListService.saveList(req.user!.id, listId);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function unsaveList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    const result = await curatedListService.unsaveList(req.user!.id, listId);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function trackListView(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    const userId = getUserId(req);
    const canView = await curatedListService.canUserViewList(listId, userId);
    if (!canView) return res.status(404).json({ message: 'List not found' });
    if (userId) {
      const { incognitoMode } = await getUserSettings(userId);
      if (incognitoMode) return res.json({ success: true, tracked: false });
    }
    const trackingData = (req as Request & { trackingData?: { ipAddress: string; userAgent: string } }).trackingData;
    if (!trackingData) return res.json({ success: true, tracked: false });
    await metricsService.trackListView(listId, { ...trackingData, userId });
    return res.json({ success: true, tracked: true });
  } catch (error) {
    return next(error);
  }
}

export async function getListComments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    const sort = COMMENT_SORTS.includes(req.query.sort as ListCommentSort) ? (req.query.sort as ListCommentSort) : 'recent';
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const result = await curatedListService.getComments(listId, { sort, page, limit, userId: getUserId(req) });
    return res.json(result);
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    return next(error);
  }
}

export async function createListComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const { content, parentId } = req.body || {};
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });

    const normalizedContent = typeof content === 'string' ? normalizeUserContent(content) : '';
    if (!normalizedContent) return res.status(400).json({ message: 'Content is required' });
    if (exceedsLimit(normalizedContent, CONTENT_LIMITS.listComment)) {
      return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.listComment} characters` });
    }
    const imageError = await validateContentImagesAsync(normalizedContent);
    if (imageError) return res.status(400).json({ message: imageError });

    const comment = await curatedListService.createComment(req.user!.id, listId, normalizedContent, parentId ? Number(parentId) : undefined);
    return res.status(201).json({ success: true, comment });
  } catch (error: any) {
    if (error?.message === 'List not found') return res.status(404).json({ message: error.message });
    if (error?.message) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function deleteListComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (isNaN(listId) || isNaN(commentId)) return res.status(400).json({ message: 'Invalid ID' });
    await curatedListService.deleteComment(req.user!.id, listId, commentId, isAdminRole(req.user?.role));
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Comment not found') return res.status(404).json({ message: error.message });
    if (error?.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}

export async function voteListComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const { commentId, type } = req.body || {};
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID' });
    if (!commentId || !['like', 'dislike'].includes(type)) return res.status(400).json({ message: 'commentId and type are required' });
    await curatedListService.voteComment(req.user!.id, listId, Number(commentId), type);
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Comment not found') return res.status(404).json({ message: error.message });
    return next(error);
  }
}

export async function searchMangaForList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const q = String(req.query.q || '').trim();
    const results = await curatedListService.searchMangaForList(q);
    return res.json({ success: true, results });
  } catch (error) {
    return next(error);
  }
}

export async function reportList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const listId = parseInt(req.params.id, 10);
    const { listTitle, reportType, details } = req.body || {};
    if (isNaN(listId) || listId <= 0) return res.status(400).json({ message: 'Valid list ID is required.' });
    if (!reportType || !['spam', 'wrong_content', 'copyright', 'other'].includes(reportType)) {
      return res.status(400).json({ message: 'Invalid report type.' });
    }
    if (String(details || '').length > 2000) return res.status(400).json({ message: 'Details are too long.' });

    const recipient = process.env.CONTACT_EMAIL || process.env.SMTP_USER || '';
    if (!recipient) {
      logger.error('CONTACT_EMAIL is not configured', { service: 'curatedListController' });
      return res.status(500).json({ message: 'Contact email is not configured.' });
    }

    const ip = req.ip;
    const userAgent = req.get('user-agent') || 'unknown';
    const reportTypeLabel = LIST_REPORT_LABELS[reportType] || reportType;

    await emailService.sendEmail(recipient, 'listReport', `List Report: ${reportTypeLabel} - ${listTitle || listId}`, {
      listId,
      listTitle: listTitle || `List #${listId}`,
      reportType,
      reportTypeLabel,
      details: details || '',
      reporterName: req.user?.name || undefined,
      reporterEmail: req.user?.email || undefined,
      ip,
      userAgent,
    });

    recordAuditFromRequest(req, {
      action: 'curated_list.report',
      category: 'social',
      resourceType: 'curated_list',
      resourceId: String(listId),
      skipDedup: true,
      metadata: contentAuditMeta({
        href: `/lists/${listId}`,
        summary: `Reported list: ${reportTypeLabel}`,
        title: listTitle || `List #${listId}`,
        content: details || undefined,
        extra: { reportType, reportTypeLabel },
      }),
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to submit list report: ${error}`, { service: 'curatedListController' });
    return next(error);
  }
}
