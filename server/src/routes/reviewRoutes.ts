import { Router, RequestHandler } from 'express';
import { fetchReviews, createReview, updateReview, deleteReview, voteReview} from '@/controllers/reviewController';

const router = Router();

router.get('/', fetchReviews as RequestHandler);
router.post('/', createReview as RequestHandler);
router.put('/:reviewId', updateReview as RequestHandler);
router.delete('/:reviewId', deleteReview as RequestHandler);
router.post('/:reviewId/vote', voteReview as RequestHandler);

export default router;
