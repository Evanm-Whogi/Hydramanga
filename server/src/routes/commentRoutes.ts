import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { commentCreateRateLimit, commentMutationRateLimit } from '@/middlewares/userActionRateLimit';
import { fetchComments, createComment, voteComment, updateComment, deleteComment } from '@/controllers/commentController';

const router = Router();

router.get('/', fetchComments as RequestHandler);
router.post('/', authMiddleware, commentCreateRateLimit, createComment as RequestHandler);
router.post('/vote', authMiddleware, commentMutationRateLimit, voteComment as RequestHandler);
router.put('/:commentId', authMiddleware, commentMutationRateLimit, updateComment as RequestHandler);
router.delete('/:commentId', authMiddleware, commentMutationRateLimit, deleteComment as RequestHandler);

export default router;
