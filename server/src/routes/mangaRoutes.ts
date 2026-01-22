import express, { RequestHandler } from 'express';
import { searchManga, getOne, updateMangaList, removeFromList, getUserLists, getPages, getAllLists, triggerMangaScan, trackMangaViewEndpoint, trackChapterViewEndpoint, getRecommendedManga }  from '@/controllers/mangaController';

const router = express.Router();

router.get('/search', searchManga as RequestHandler);

// Lists - Must be before /:id to avoid matching "list" as an id
router.get('/list', getUserLists as RequestHandler)
router.post('/list', updateMangaList as RequestHandler);
router.get('/lists', getAllLists as RequestHandler);
router.post('/list/remove', removeFromList as RequestHandler)

// Trigger on-demand scan
router.post('/:id/scan', triggerMangaScan as RequestHandler);

// Client-side view tracking
router.post('/:id/track-view', trackMangaViewEndpoint as RequestHandler);
router.post('/:id/chapter/:chapterId/track-view', trackChapterViewEndpoint as RequestHandler);

// Recommendations
router.get('/:id/recommendations', getRecommendedManga as RequestHandler);

// Dynamic routes - Keep these last
router.get('/:id', getOne as RequestHandler);

// Chapter Pages
router.get(`/:id/:chapterId`, getPages as RequestHandler);

export default router;