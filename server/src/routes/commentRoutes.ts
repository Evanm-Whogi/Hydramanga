import { Router, RequestHandler } from 'express';
import { fetchComments, createComment, likeComment, deleteComment } from '@/controllers/commentController';

const router = Router();

router.get('/', fetchComments as RequestHandler);
router.post('/', createComment as RequestHandler);
router.post('/like', likeComment as RequestHandler);
router.delete('/:commentId', deleteComment as RequestHandler);

export default router;
