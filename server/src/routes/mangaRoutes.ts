import express, { RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { optionalAuthMiddleware } from '@/middlewares/optionalAuth';
import { searchManga, getOne, getPages, triggerMangaScan, trackMangaViewEndpoint, trackChapterViewEndpoint, getRecommendedManga, getGallery, getCollections, randomManga, getMangaTags }  from '@/controllers/mangaController';
import { requireRole } from '@/middlewares/requireRole';
import { mangaSearchRateLimit } from '@/middlewares/userActionRateLimit';

const router = express.Router();

router.get('/search', mangaSearchRateLimit, searchManga as RequestHandler);

router.get('/tags', getMangaTags as RequestHandler);

router.get('/random', randomManga as RequestHandler);

router.get('/collections', getCollections as RequestHandler);

router.get('/:id/gallery', getGallery as RequestHandler);

router.post('/:id/scan', authMiddleware, requireRole('admin'), triggerMangaScan as RequestHandler);

router.post('/:id/track-view', authMiddleware, trackMangaViewEndpoint as RequestHandler);
router.post('/:id/chapter/:chapterId/track-view', authMiddleware, trackChapterViewEndpoint as RequestHandler);

router.get('/:id/recommendations', getRecommendedManga as RequestHandler);

router.get('/:id/:chapterId', optionalAuthMiddleware, getPages as RequestHandler);

router.get('/:id', getOne as RequestHandler);

export default router;
