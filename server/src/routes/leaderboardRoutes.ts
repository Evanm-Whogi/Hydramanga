import { Router, RequestHandler } from 'express';
import { getLeaderboardSummary, getLeaderboard } from '@/controllers/leaderboardController';

const router = Router();

router.get('/summary', getLeaderboardSummary as RequestHandler);
router.get('/', getLeaderboard as RequestHandler);

export default router;
