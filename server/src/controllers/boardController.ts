import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq } from 'drizzle-orm';
import { boardService, type BoardListSort } from '@/services/boardService';
import { isAdminRole } from '@/lib/authHelpers';
import { discordService } from '@/services/discordService';
import { recordAuditFromRequest } from '@/audit/record';
import { boardPostHref, contentAuditMeta } from '@/audit/metadataHelpers';
import { normalizeUserContent } from '@/lib/normalizeUserContent';
import { CONTENT_LIMITS, exceedsLimit } from '@/lib/securityLimits';
import { validateContentImagesAsync } from '@/lib/externalImageValidation';
import { DEFAULT_FORUM_CATEGORY, isForumCategory } from '@/lib/forumCategories';

function parseBoardListSort(value: unknown): BoardListSort {
  if (value === 'top' || value === 'oldest') return value;
  return 'latest';
}

export async function listBoardPosts(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const sort = parseBoardListSort(req.query.sort);
    const result = await boardService.listPosts({ page, q, category, sort });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const data = await boardService.getPost(postId);
    if (!data) return res.status(404).json({ message: 'Post not found' });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

export async function createBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, content, category } = req.body;
    const normalizedTitle = typeof title === 'string' ? normalizeUserContent(title) : '';
    const normalizedContent = typeof content === 'string' ? normalizeUserContent(content) : '';
    const normalizedCategory = typeof category === 'string' && isForumCategory(category) ? category : DEFAULT_FORUM_CATEGORY;
    if (!normalizedTitle || !normalizedContent) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    if (typeof category === 'string' && category && !isForumCategory(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }
    if (exceedsLimit(normalizedTitle, CONTENT_LIMITS.boardTitle)) {
      return res.status(400).json({ message: `Title must be at most ${CONTENT_LIMITS.boardTitle} characters` });
    }
    if (exceedsLimit(normalizedContent, CONTENT_LIMITS.boardPost)) {
      return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.boardPost} characters` });
    }
    const imageError = await validateContentImagesAsync(normalizedContent);
    if (imageError) return res.status(400).json({ message: imageError });
    const post = await boardService.createPost(req.user.id, normalizedTitle, normalizedContent, normalizedCategory);

    discordService
      .notifyBoardThread(req.user.name || 'Unknown', post.id, post.title, post.content)
      .catch(() => undefined);

    recordAuditFromRequest(req, {
      action: 'board.post.create',
      category: 'community',
      resourceType: 'board_post',
      resourceId: String(post.id),
      metadata: contentAuditMeta({
        href: boardPostHref(post.id),
        summary: `Created board post: ${normalizedTitle}`,
        title: normalizedTitle,
        content: normalizedContent,
      }),
    });

    return res.status(201).json({ post });
  } catch (error) {
    return next(error);
  }
}

export async function createBoardReply(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const { content, parentId } = req.body;
    const normalizedContent = typeof content === 'string' ? normalizeUserContent(content) : '';
    if (!normalizedContent) return res.status(400).json({ message: 'Content is required' });
    if (exceedsLimit(normalizedContent, CONTENT_LIMITS.boardReply)) {
      return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.boardReply} characters` });
    }
    const imageError = await validateContentImagesAsync(normalizedContent);
    if (imageError) return res.status(400).json({ message: imageError });
    const reply = await boardService.createReply(
      req.user.id,
      postId,
      normalizedContent,
      parentId ? parseInt(parentId, 10) : undefined
    );
    recordAuditFromRequest(req, {
      action: 'board.reply.create',
      category: 'community',
      resourceType: 'board_reply',
      resourceId: String(reply.id),
      metadata: contentAuditMeta({
        href: boardPostHref(postId),
        summary: 'Replied on a board post',
        content: normalizedContent,
        extra: { postId, parentId: parentId ?? null },
      }),
    });

    return res.status(201).json({ reply });
  } catch (error: any) {
    if (error.message === 'Post not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Post is locked') return res.status(403).json({ message: error.message });
    return next(error);
  }
}

export async function voteBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const { postId, type } = req.body;
    if (type !== 'like' && type !== 'dislike') {
      return res.status(400).json({ message: 'type must be like or dislike' });
    }
    await boardService.votePost(req.user.id, parseInt(postId, 10), type);
    recordAuditFromRequest(req, {
      action: 'board.post.vote',
      category: 'community',
      resourceType: 'board_post',
      resourceId: String(postId),
      metadata: { voteType: type },
    });
    return res.json({ message: 'Vote recorded' });
  } catch (error) {
    return next(error);
  }
}

export async function voteBoardReply(req: Request, res: Response, next: NextFunction) {
  try {
    const { replyId, type } = req.body;
    if (type !== 'like' && type !== 'dislike') {
      return res.status(400).json({ message: 'type must be like or dislike' });
    }
    await boardService.voteReply(req.user.id, parseInt(replyId, 10), type);
    recordAuditFromRequest(req, {
      action: 'board.reply.vote',
      category: 'community',
      resourceType: 'board_reply',
      resourceId: String(replyId),
      metadata: { voteType: type },
    });
    return res.json({ message: 'Vote recorded' });
  } catch (error) {
    return next(error);
  }
}

export async function adminBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const { isPinned, isLocked, isDeleted } = req.body;
    await boardService.adminUpdatePost(
      postId,
      { isPinned, isLocked, isDeleted },
      req.user.id
    );
    const flags: string[] = [];
    if (isPinned !== undefined) flags.push(isPinned ? 'pinned' : 'unpinned');
    if (isLocked !== undefined) flags.push(isLocked ? 'locked' : 'unlocked');
    if (isDeleted) flags.push('deleted');
    recordAuditFromRequest(req, {
      action: 'board.post.admin',
      category: 'moderation',
      resourceType: 'board_post',
      resourceId: String(postId),
      metadata: contentAuditMeta({
        href: boardPostHref(postId),
        summary: `Moderated board post #${postId}${flags.length ? `: ${flags.join(', ')}` : ''}`,
        extra: { isPinned, isLocked, isDeleted },
      }),
    });
    return res.json({ message: 'Post updated' });
  } catch (error) {
    return next(error);
  }
}

export async function updateBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const { title, content, category } = req.body;
    const normalizedTitle = typeof title === 'string' ? normalizeUserContent(title) : undefined;
    const normalizedContent = typeof content === 'string' ? normalizeUserContent(content) : undefined;
    if (normalizedTitle !== undefined && !normalizedTitle) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (normalizedContent !== undefined && !normalizedContent) {
      return res.status(400).json({ message: 'Content is required' });
    }
    if (category !== undefined && (typeof category !== 'string' || !isForumCategory(category))) {
      return res.status(400).json({ message: 'Invalid category' });
    }
    if (normalizedTitle != null && exceedsLimit(normalizedTitle, CONTENT_LIMITS.boardTitle)) {
      return res.status(400).json({ message: `Title must be at most ${CONTENT_LIMITS.boardTitle} characters` });
    }
    if (normalizedContent != null && exceedsLimit(normalizedContent, CONTENT_LIMITS.boardPost)) {
      return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.boardPost} characters` });
    }
    if (normalizedContent != null) {
      const imageError = await validateContentImagesAsync(normalizedContent);
      if (imageError) return res.status(400).json({ message: imageError });
    }
    const post = await boardService.updatePost(req.user.id, postId, {
      title: normalizedTitle,
      content: normalizedContent,
      category: typeof category === 'string' && isForumCategory(category) ? category : undefined,
    });
    recordAuditFromRequest(req, {
      action: 'board.post.update',
      category: 'community',
      resourceType: 'board_post',
      resourceId: String(postId),
      metadata: contentAuditMeta({
        href: boardPostHref(postId),
        summary: 'Edited a board post',
        title: title?.trim() ?? post.title,
        content: content?.trim() ?? post.content,
      }),
    });
    return res.json({ post });
  } catch (error: any) {
    if (error.message === 'Post not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}

export async function deleteBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const existingPost = await boardService.getPost(postId);
    await boardService.deletePost(req.user.id, postId, isAdminRole(req.user.role));
    recordAuditFromRequest(req, {
      action: isAdminRole(req.user.role) ? 'board.post.delete.admin' : 'board.post.delete',
      category: 'community',
      resourceType: 'board_post',
      resourceId: String(postId),
      metadata: contentAuditMeta({
        href: boardPostHref(postId),
        summary: isAdminRole(req.user.role) ? 'Admin deleted a board post' : 'Deleted a board post',
        title: existingPost?.post?.title,
        content: existingPost?.post?.content,
      }),
    });
    return res.json({ message: 'Post deleted' });
  } catch (error: any) {
    if (error.message === 'Post not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}

export async function updateBoardReply(req: Request, res: Response, next: NextFunction) {
  try {
    const replyId = parseInt(req.params.replyId, 10);
    const { content } = req.body;
    const normalizedContent = typeof content === 'string' ? normalizeUserContent(content) : '';
    if (!normalizedContent) return res.status(400).json({ message: 'Content is required' });
    if (exceedsLimit(normalizedContent, CONTENT_LIMITS.boardReply)) {
      return res.status(400).json({ message: `Content must be at most ${CONTENT_LIMITS.boardReply} characters` });
    }
    const imageError = await validateContentImagesAsync(normalizedContent);
    if (imageError) return res.status(400).json({ message: imageError });
    const reply = await boardService.updateReply(req.user.id, replyId, normalizedContent);
    recordAuditFromRequest(req, {
      action: 'board.reply.update',
      category: 'community',
      resourceType: 'board_reply',
      resourceId: String(replyId),
      metadata: contentAuditMeta({
        href: boardPostHref(reply.postId),
        summary: 'Edited a board reply',
        content: normalizedContent,
        extra: { postId: reply.postId },
      }),
    });
    return res.json({ reply });
  } catch (error: any) {
    if (error.message === 'Reply not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}

export async function deleteBoardReply(req: Request, res: Response, next: NextFunction) {
  try {
    const replyId = parseInt(req.params.replyId, 10);
    const existing = await db.query.boardReplies.findFirst({
      where: eq(schema.boardReplies.id, replyId),
    });
    await boardService.deleteReply(req.user.id, replyId, isAdminRole(req.user.role));
    recordAuditFromRequest(req, {
      action: isAdminRole(req.user.role) ? 'board.reply.delete.admin' : 'board.reply.delete',
      category: 'community',
      resourceType: 'board_reply',
      resourceId: String(replyId),
      metadata: contentAuditMeta({
        href: existing ? boardPostHref(existing.postId) : '/forum',
        summary: isAdminRole(req.user.role) ? 'Admin deleted a board reply' : 'Deleted a board reply',
        content: existing?.content,
        extra: { postId: existing?.postId },
      }),
    });
    return res.json({ message: 'Reply deleted' });
  } catch (error: any) {
    if (error.message === 'Reply not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}
