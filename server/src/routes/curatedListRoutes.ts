import { Router, RequestHandler } from 'express';
import { authMiddleware } from '@/middlewares/auth';
import { optionalAuthMiddleware } from '@/middlewares/optionalAuth';
import { listWriteRateLimit, listVoteRateLimit, listCommentCreateRateLimit, commentMutationRateLimit, listViewTrackRateLimit } from '@/middlewares/userActionRateLimit';
import { publicFormRateLimiter } from '@/middlewares/rateLimit';
import {
  discoverLists, getMyLists, getSavedLists, createList, getListDetail, updateList, deleteList,
  addListItem, removeListItem, voteList, saveList, unsaveList, trackListView,
  getListComments, createListComment, deleteListComment, voteListComment, searchMangaForList, reportList,
} from '@/controllers/curatedListController';

const router = Router();

router.get('/', optionalAuthMiddleware, discoverLists as RequestHandler);
router.get('/mine', authMiddleware, getMyLists as RequestHandler);
router.get('/saved', authMiddleware, getSavedLists as RequestHandler);
router.get('/search-manga', authMiddleware, searchMangaForList as RequestHandler);
router.post('/', authMiddleware, listWriteRateLimit, createList as RequestHandler);

router.get('/:id', optionalAuthMiddleware, getListDetail as RequestHandler);
router.put('/:id', authMiddleware, listWriteRateLimit, updateList as RequestHandler);
router.delete('/:id', authMiddleware, listWriteRateLimit, deleteList as RequestHandler);
router.post('/:id/items', authMiddleware, listWriteRateLimit, addListItem as RequestHandler);
router.delete('/:id/items/:seriesId', authMiddleware, listWriteRateLimit, removeListItem as RequestHandler);
router.post('/:id/vote', authMiddleware, listVoteRateLimit, voteList as RequestHandler);
router.post('/:id/save', authMiddleware, listWriteRateLimit, saveList as RequestHandler);
router.delete('/:id/save', authMiddleware, listWriteRateLimit, unsaveList as RequestHandler);
router.post('/:id/track-view', optionalAuthMiddleware, listViewTrackRateLimit, trackListView as RequestHandler);
router.get('/:id/comments', optionalAuthMiddleware, getListComments as RequestHandler);
router.post('/:id/comments', authMiddleware, listCommentCreateRateLimit, createListComment as RequestHandler);
router.delete('/:id/comments/:commentId', authMiddleware, commentMutationRateLimit, deleteListComment as RequestHandler);
router.post('/:id/comments/vote', authMiddleware, listVoteRateLimit, voteListComment as RequestHandler);
router.post('/:id/report', authMiddleware, publicFormRateLimiter, reportList as RequestHandler);

export default router;
