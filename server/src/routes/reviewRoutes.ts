import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { reviewCreateRateLimit } from '@/middlewares/userActionRateLimit';
import { fetchReviews, createReview, updateReview, deleteReview, voteReview} from '@/controllers/reviewController';

const router = Router();

router.get('/', fetchReviews as RequestHandler);
router.post('/', authMiddleware, reviewCreateRateLimit, createReview as RequestHandler);
router.put('/:reviewId', authMiddleware, updateReview as RequestHandler);
router.delete('/:reviewId', authMiddleware, deleteReview as RequestHandler);
router.post('/:reviewId/vote', authMiddleware, voteReview as RequestHandler);

export default router;
