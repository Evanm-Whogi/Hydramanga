import express, { RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { searchManga, getOne, getPages, getAllLists, triggerMangaScan, trackMangaViewEndpoint, trackChapterViewEndpoint, getRecommendedManga, getGallery, getCollections, randomManga, getMangaTags }  from '@/controllers/mangaController';
import { addBookmark, removeBookmark, getSeriesBookmarks, getBookmark } from '@/controllers/bookmarkController';
import { requireRole } from '@/middlewares/requireRole';
import { mangaSearchRateLimit, bookmarkRateLimit } from '@/middlewares/userActionRateLimit';

const router = express.Router();

router.get('/search', mangaSearchRateLimit, searchManga as RequestHandler);

router.get('/tags', getMangaTags as RequestHandler);

router.get('/random', randomManga as RequestHandler);

router.get('/collections', getCollections as RequestHandler);

router.get('/lists', authMiddleware, getAllLists as RequestHandler);

router.get('/:id/gallery', getGallery as RequestHandler);

router.post('/:id/scan', authMiddleware, requireRole('admin'), triggerMangaScan as RequestHandler);

router.post('/:id/track-view', authMiddleware, trackMangaViewEndpoint as RequestHandler);
router.post('/:id/chapter/:chapterId/track-view', authMiddleware, trackChapterViewEndpoint as RequestHandler);

router.post('/:id/chapter/:chapterId/bookmark', authMiddleware, bookmarkRateLimit, addBookmark as RequestHandler);
router.delete('/:id/chapter/:chapterId/bookmark', authMiddleware, bookmarkRateLimit, removeBookmark as RequestHandler);
router.get('/:id/chapter/:chapterId/bookmark', authMiddleware, getBookmark as RequestHandler);
router.get('/:id/bookmarks', authMiddleware, getSeriesBookmarks as RequestHandler);

router.get('/:id/recommendations', getRecommendedManga as RequestHandler);

router.get('/:id/:chapterId', authMiddleware, getPages as RequestHandler);

router.get('/:id', getOne as RequestHandler);

export default router;
