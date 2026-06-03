import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { requireRole } from '@/middlewares/requireRole';
import { boardPostRateLimit, boardReplyRateLimit } from '@/middlewares/userActionRateLimit';
import { listBoardPosts, getBoardPost, createBoardPost, createBoardReply, voteBoardPost, voteBoardReply, adminBoardPost, updateBoardPost, deleteBoardPost, updateBoardReply, deleteBoardReply } from '@/controllers/boardController';

const router = Router();

router.get('/posts', listBoardPosts as RequestHandler);
router.get('/posts/:postId', getBoardPost as RequestHandler);
router.post('/posts', authMiddleware, boardPostRateLimit, createBoardPost as RequestHandler);
router.post('/posts/:postId/replies', authMiddleware, boardReplyRateLimit, createBoardReply as RequestHandler);
router.post('/vote', authMiddleware, voteBoardPost as RequestHandler);
router.post('/vote/reply', authMiddleware, voteBoardReply as RequestHandler);
router.patch('/posts/:postId', authMiddleware, updateBoardPost as RequestHandler);
router.delete('/posts/:postId', authMiddleware, deleteBoardPost as RequestHandler);
router.patch('/replies/:replyId', authMiddleware, updateBoardReply as RequestHandler);
router.delete('/replies/:replyId', authMiddleware, deleteBoardReply as RequestHandler);
router.patch('/posts/:postId/admin', authMiddleware, requireRole('admin'), adminBoardPost as RequestHandler);

export default router;
