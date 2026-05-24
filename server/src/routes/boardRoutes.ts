import { Router, RequestHandler } from 'express';
import { requireRole } from '@/middlewares/requireRole';
import { boardPostRateLimit, boardReplyRateLimit } from '@/middlewares/userActionRateLimit';
import { listBoardPosts, getBoardPost, createBoardPost, createBoardReply, voteBoardPost, voteBoardReply, adminBoardPost, updateBoardPost, deleteBoardPost, updateBoardReply, deleteBoardReply } from '@/controllers/boardController';

const router = Router();

router.get('/posts', listBoardPosts as RequestHandler);
router.get('/posts/:postId', getBoardPost as RequestHandler);
router.post('/posts', boardPostRateLimit, createBoardPost as RequestHandler);
router.post('/posts/:postId/replies', boardReplyRateLimit, createBoardReply as RequestHandler);
router.post('/vote', voteBoardPost as RequestHandler);
router.post('/vote/reply', voteBoardReply as RequestHandler);
router.patch('/posts/:postId', updateBoardPost as RequestHandler);
router.delete('/posts/:postId', deleteBoardPost as RequestHandler);
router.patch('/replies/:replyId', updateBoardReply as RequestHandler);
router.delete('/replies/:replyId', deleteBoardReply as RequestHandler);
router.patch('/posts/:postId/admin', requireRole('admin'), adminBoardPost as RequestHandler);

export default router;
