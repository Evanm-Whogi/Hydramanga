import express, { RequestHandler } from 'express';
import { searchManga, getOne, getPages, getAllLists, triggerMangaScan, trackMangaViewEndpoint, trackChapterViewEndpoint, getRecommendedManga }  from '@/controllers/mangaController';
import { addBookmark, removeBookmark, getSeriesBookmarks, getBookmark } from '@/controllers/bookmarkController';

const router = express.Router();

router.get('/search', searchManga as RequestHandler);

// Aggregate lists endpoint - returns all lists with manga
router.get('/lists', getAllLists as RequestHandler);

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

// Dynamic routes - Keep these last
router.get('/:id', getOne as RequestHandler);

// Chapter Pages
router.get(`/:id/:chapterId`, getPages as RequestHandler);

export default router;