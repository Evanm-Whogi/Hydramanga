import { Router, RequestHandler } from 'express';
import { getLeaderboardSummary, getLeaderboardCommenters, getLeaderboardReaders, getLeaderboardStreaks } from '@/controllers/leaderboardController';  

const router = Router();

router.get('/summary', getLeaderboardSummary as RequestHandler);
router.get('/commenters', getLeaderboardCommenters as RequestHandler);
router.get('/readers', getLeaderboardReaders as RequestHandler);
router.get('/streaks', getLeaderboardStreaks as RequestHandler);

export default router;
