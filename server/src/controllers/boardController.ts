import { Request, Response, NextFunction } from 'express';
import { boardService } from '@/services/boardService';
import { isAdminRole } from '@/lib/authHelpers';

export async function listBoardPosts(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const posts = await boardService.listPosts(page);
    return res.json({ posts });
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
    const { title, content } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const post = await boardService.createPost(req.user.id, title, content);
    return res.status(201).json({ post });
  } catch (error) {
    return next(error);
  }
}

export async function createBoardReply(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const { content, parentId } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });
    const reply = await boardService.createReply(
      req.user.id,
      postId,
      content,
      parentId ? parseInt(parentId, 10) : undefined
    );
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
    return res.json({ message: 'Post updated' });
  } catch (error) {
    return next(error);
  }
}

export async function updateBoardPost(req: Request, res: Response, next: NextFunction) {
  try {
    const postId = parseInt(req.params.postId, 10);
    const { title, content } = req.body;
    const post = await boardService.updatePost(req.user.id, postId, { title, content });
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
    await boardService.deletePost(req.user.id, postId, isAdminRole(req.user.role));
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
    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });
    const reply = await boardService.updateReply(req.user.id, replyId, content);
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
    await boardService.deleteReply(req.user.id, replyId, isAdminRole(req.user.role));
    return res.json({ message: 'Reply deleted' });
  } catch (error: any) {
    if (error.message === 'Reply not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Forbidden') return res.status(403).json({ message: error.message });
    return next(error);
  }
}
