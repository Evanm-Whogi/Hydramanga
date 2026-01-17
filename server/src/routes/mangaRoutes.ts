import express, { RequestHandler } from 'express';
import { searchManga, getOne, updateMangaList, removeFromList, getUserLists, getPages }  from '@/controllers/mangaController';

const router = express.Router();

router.get('/search', searchManga as RequestHandler);

// Lists
router.get('/list', getUserLists as RequestHandler)
router.post('/list', updateMangaList as RequestHandler);
router.post('/list/remove', removeFromList as RequestHandler)

router.get(`/:id/:chapterId`, getPages as RequestHandler);

router.get('/:id', getOne as RequestHandler);

export default router;