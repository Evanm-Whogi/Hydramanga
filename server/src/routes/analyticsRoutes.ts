import { Router, RequestHandler } from 'express';
import { getTrending, getMangaAnalytics, getMyProgress, getMangaProgress, updateProgress, deleteProgress, getMyStats, getSeriesChapterProgress, markChapterAsRead, markChapterAsUnread, recordReadingTime } from '@/controllers/analyticsController';

const router = Router();

// Trending and Manga Analytics
router.get('/trending', getTrending as RequestHandler);
router.get('/manga/:id', getMangaAnalytics as RequestHandler);

// User Progress
router.get('/progress', getMyProgress as RequestHandler);
router.get('/progress/manga/:id', getMangaProgress as RequestHandler);
router.get('/progress/manga/:id/chapters', getSeriesChapterProgress as RequestHandler);
router.post('/progress', updateProgress as RequestHandler);
// Record reading time for a manga/chapter
router.post('/progress/time', recordReadingTime as RequestHandler);
router.delete('/progress/manga/:id', deleteProgress as RequestHandler);

// Chapter Reading Progress
router.post('/progress/mark-read', markChapterAsRead as RequestHandler);
router.post('/progress/mark-unread', markChapterAsUnread as RequestHandler);

// Stats
router.get('/stats', getMyStats as RequestHandler);

export default router;
