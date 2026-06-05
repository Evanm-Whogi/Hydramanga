import { Router, RequestHandler } from 'express';
import { getMyProgress, getMangaProgress, updateProgress, deleteProgress, getMyStats, getSeriesChapterProgress, markChapterAsRead, markChapterAsUnread, recordReadingTime, clearAllProgress, getMyViewHistory, deleteViewHistory, clearAllViewHistory } from '@/controllers/analyticsController';
import { progressDestructiveRateLimit } from '@/middlewares/userActionRateLimit';

const router = Router();

// User Progress
router.get('/progress', getMyProgress as RequestHandler);
router.get('/progress/manga/:id', getMangaProgress as RequestHandler);
router.get('/progress/manga/:id/chapters', getSeriesChapterProgress as RequestHandler);
router.post('/progress', updateProgress as RequestHandler);
router.post('/progress/time', recordReadingTime as RequestHandler);
router.delete('/progress/manga/:id', deleteProgress as RequestHandler);
router.delete('/progress/all', progressDestructiveRateLimit, clearAllProgress as RequestHandler);

// Chapter Reading Progress
router.post('/progress/mark-read', markChapterAsRead as RequestHandler);
router.post('/progress/mark-unread', markChapterAsUnread as RequestHandler);

// Stats
router.get('/stats', getMyStats as RequestHandler);

// View History
router.get('/views', getMyViewHistory as RequestHandler);
router.delete('/views/all', progressDestructiveRateLimit, clearAllViewHistory as RequestHandler);
router.delete('/views/:id', progressDestructiveRateLimit, deleteViewHistory as RequestHandler);

export default router;