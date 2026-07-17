import { Router, RequestHandler } from 'express';
import {getRecentlyRead, getRecentlyUpdated, getPopularManga, getHeroManga, getHighScores, getRecentChaptersFromUserList, getRecentComments, getTopCommenters  } from '@/controllers/homeController';
import { authMiddleware } from '@/middlewares/auth';

const router = Router();

router.get('/home/recentlyRead', authMiddleware, getRecentlyRead as RequestHandler);
router.get('/home/recentlyUpdated', getRecentlyUpdated as RequestHandler);
router.get('/home/popularManga', getPopularManga as RequestHandler);
router.get('/home/heroManga', getHeroManga as RequestHandler);
router.get('/home/highScores', getHighScores as RequestHandler);
router.get('/home/recentChaptersFromList', authMiddleware, getRecentChaptersFromUserList as RequestHandler);
router.get('/home/recentComments', getRecentComments as RequestHandler);
router.get('/home/topCommenters', getTopCommenters as RequestHandler);

export default router;
