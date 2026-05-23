import { Router, RequestHandler } from 'express';
import { fetchComments, createComment, voteComment, updateComment, deleteComment } from '@/controllers/commentController';

const router = Router();

router.get('/', fetchComments as RequestHandler);
router.post('/', createComment as RequestHandler);
router.post('/vote', voteComment as RequestHandler);
router.put('/:commentId', updateComment as RequestHandler);
router.delete('/:commentId', deleteComment as RequestHandler);

export default router;
