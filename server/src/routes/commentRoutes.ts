import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { commentCreateRateLimit } from '@/middlewares/userActionRateLimit';
import { fetchComments, createComment, voteComment, updateComment, deleteComment } from '@/controllers/commentController';

const router = Router();

router.get('/', fetchComments as RequestHandler);
router.post('/', authMiddleware, commentCreateRateLimit, createComment as RequestHandler);
router.post('/vote', authMiddleware, voteComment as RequestHandler);
router.put('/:commentId', authMiddleware, updateComment as RequestHandler);
router.delete('/:commentId', authMiddleware, deleteComment as RequestHandler);

export default router;
