import { Request, Response, NextFunction } from 'express';
import { profileSectionService, ProfileAccessError } from '@/services/profileSectionService';
import { profileWallService } from '@/services/profileWallService';
import { userProgressService } from '@/services/userProgressService';
import { getUserSettings, resolveHideNsfw } from '@/services/userSettingsService';
import { canViewProfileSection } from '@/lib/profileVisibility';
import { BOOKMARK_STATUSES, type BookmarkSort, type BookmarkStatus } from '@/services/bookmarkService';
import { db, schema } from '@/db/index';
import { eq, or } from 'drizzle-orm';
import { isAdminRole } from '@/lib/authHelpers';

async function resolveTargetUserId(identifier: string, viewerUserId: string | null): Promise<{ userId: string; isOwner: boolean } | null> {
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

function handleProfileError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof ProfileAccessError) return res.status(error.statusCode).json({ message: error.message });
  return next(error);
}

export async function getProfileStats(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.identifier;
    const viewerUserId = req.user?.id ?? null;
    const resolved = await resolveTargetUserId(identifier, viewerUserId);
    if (!resolved) return res.status(404).json({ message: 'User not found' });

    const settings = await getUserSettings(resolved.userId);
    if (!resolved.isOwner && !settings.isProfilePublic) return res.status(403).json({ message: 'Profile is private' });
    if (!canViewProfileSection(settings.profileVisibility, 'readingStats', resolved.isOwner)) {
      return res.status(403).json({ message: 'Reading stats are hidden' });
    }

    const stats = await userProgressService.getUserStats(resolved.userId);
    return res.json({ stats });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function getProfileFavorites(req: Request, res: Response, next: NextFunction) {
  try {
    const favorites = await profileSectionService.getFavorites(req.params.identifier, req.user?.id ?? null, await resolveHideNsfw(req));
    return res.json({ favorites });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function setMyFavorites(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const seriesIds = Array.isArray(req.body?.seriesIds) ? req.body.seriesIds : [];
    const favorites = await profileSectionService.setFavorites(userId, seriesIds);
    return res.json({ favorites });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function getProfileWall(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const sort = (req.query.sort as 'recent' | 'oldest' | 'top' | 'worst') || 'recent';
    const data = await profileWallService.getWallPosts(req.params.identifier, req.user?.id ?? null, { sort, page, limit });
    return res.json(data);
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function createProfileWallPost(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const parentId = req.body?.parentId != null ? Number(req.body.parentId) : undefined;
    const post = await profileWallService.createWallPost(req.params.identifier, userId, req.body?.content ?? '', parentId);
    return res.status(201).json({ post });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function updateProfileWallPost(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: 'Invalid post id' });
    const post = await profileWallService.updateWallPost(postId, userId, req.body?.content ?? '');
    return res.json({ post });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function voteProfileWallPost(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { postId, type } = req.body || {};
    if (!postId || !['like', 'dislike'].includes(type)) return res.status(400).json({ message: 'postId and type are required' });
    await profileWallService.voteWallPost(req.params.identifier, userId, Number(postId), type);
    return res.json({ success: true });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function deleteProfileWallPost(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: 'Invalid post id' });
    await profileWallService.deleteWallPost(postId, userId, isAdminRole(req.user?.role));
    return res.json({ success: true });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function getProfileComments(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const data = await profileSectionService.getUserComments(req.params.identifier, req.user?.id ?? null, page, limit);
    return res.json(data);
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function getProfileRecentReads(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const data = await profileSectionService.getRecentReads(req.params.identifier, req.user?.id ?? null, page, limit, await resolveHideNsfw(req));
    return res.json(data);
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function getProfileBookmarks(req: Request, res: Response, next: NextFunction) {
  try {
    const statusParam = req.query.status;
    const typeParam = req.query.type;
    const status = statusParam
      ? (Array.isArray(statusParam) ? statusParam : [statusParam]).map(String).filter((s): s is BookmarkStatus => BOOKMARK_STATUSES.includes(s as BookmarkStatus))
      : undefined;
    const types = typeParam ? (Array.isArray(typeParam) ? typeParam : [typeParam]).map(String) : undefined;
    const sortRaw = (req.query.sort as string) || 'bookmarked';
    const sort: BookmarkSort = ['updated', 'lastRead', 'bookmarked', 'title', 'ranking'].includes(sortRaw) ? sortRaw as BookmarkSort : 'bookmarked';
    const limit = Math.min(parseInt(String(req.query.limit || '500'), 10) || 500, 500);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    const data = await profileSectionService.getProfileBookmarks(req.params.identifier, req.user?.id ?? null, { sort, status, types, limit, offset }, await resolveHideNsfw(req));
    return res.json({ success: true, bookmarks: data.bookmarks, total: data.total });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}

export async function getProfileLists(req: Request, res: Response, next: NextFunction) {
  try {
    const lists = await profileSectionService.getPublicLists(req.params.identifier, req.user?.id ?? null);
    return res.json({ lists });
  } catch (error) {
    return handleProfileError(error, res, next);
  }
}
