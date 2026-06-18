import { Router, RequestHandler } from 'express';
import { getBookmarks, getBookmarkStatus, setBookmark, removeBookmark } from '@/controllers/bookmarkController';
import { listWriteRateLimit } from '@/middlewares/userActionRateLimit';

const router = Router();

router.get('/', getBookmarks as RequestHandler);
router.get('/:seriesId', getBookmarkStatus as RequestHandler);
router.put('/:seriesId', listWriteRateLimit, setBookmark as RequestHandler);
router.delete('/:seriesId', listWriteRateLimit, removeBookmark as RequestHandler);

export default router;
