import { Router, RequestHandler } from 'express';
import {getRecentlyRead, getRecentlyAdded, getPopularChapters, getPopularManga, getHighScores, getMostFollowed, getRecentChaptersFromUserList, getRecentComments, getTopCommenters  } from '@/controllers/homeController';
import getIndexPage from '@/controllers/indexController';
import { authMiddleware } from '@/middlewares/auth';

const router = Router();

// Home aggregator - requires authentication
router.get('/home/recentlyRead', authMiddleware, getRecentlyRead as RequestHandler);
router.get('/home/recentlyAdded', authMiddleware, getRecentlyAdded as RequestHandler);
router.get('/home/popularChapters', authMiddleware, getPopularChapters as RequestHandler);
router.get('/home/popularManga', authMiddleware, getPopularManga as RequestHandler);
router.get('/home/highScores', authMiddleware, getHighScores as RequestHandler);
router.get('/home/mostFollowed', authMiddleware, getMostFollowed as RequestHandler);
router.get('/home/recentChaptersFromList', authMiddleware, getRecentChaptersFromUserList as RequestHandler);
router.get('/home/recentComments', authMiddleware, getRecentComments as RequestHandler);
router.get('/home/topCommenters', authMiddleware, getTopCommenters as RequestHandler);


// Index aggregator - public
router.get('/index', getIndexPage as RequestHandler);

export default router;
