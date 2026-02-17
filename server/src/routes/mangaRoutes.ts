import express, { RequestHandler } from 'express';
import { searchManga, getOne, getPages, getAllLists, triggerMangaScan, trackMangaViewEndpoint, trackChapterViewEndpoint, getRecommendedManga, getGallery, getCollections, randomManga }  from '@/controllers/mangaController';
import { addBookmark, removeBookmark, getSeriesBookmarks, getBookmark } from '@/controllers/bookmarkController';

const router = express.Router();

router.get('/search', searchManga as RequestHandler);

router.get('/random', randomManga as RequestHandler);

router.get('/collections', getCollections as RequestHandler);

// Aggregate lists endpoint - returns all lists with manga
router.get('/lists', getAllLists as RequestHandler);

// Gallery (keep before dynamic routes)
router.get('/:id/gallery', getGallery as RequestHandler);

// Trigger on-demand scan
router.post('/:id/scan', triggerMangaScan as RequestHandler);

// Client-side view tracking
router.post('/:id/track-view', trackMangaViewEndpoint as RequestHandler);
router.post('/:id/chapter/:chapterId/track-view', trackChapterViewEndpoint as RequestHandler);

// Bookmarks
router.post('/:id/chapter/:chapterId/bookmark', addBookmark as RequestHandler);
router.delete('/:id/chapter/:chapterId/bookmark', removeBookmark as RequestHandler);
router.get('/:id/chapter/:chapterId/bookmark', getBookmark as RequestHandler);
router.get('/:id/bookmarks', getSeriesBookmarks as RequestHandler);

// Recommendations
router.get('/:id/recommendations', getRecommendedManga as RequestHandler);

// Chapter Pages (keep before single-id route)
router.get('/:id/:chapterId', getPages as RequestHandler);

// Dynamic routes - Keep these last
router.get('/:id', getOne as RequestHandler);

export default router;