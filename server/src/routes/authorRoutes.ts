import { Router, RequestHandler } from 'express';
import { getAuthors, getTopAuthors, getAuthorDetail } from '@/controllers/authorController';

const router = Router();

router.get('/top', getTopAuthors as RequestHandler);
router.get('/', getAuthors as RequestHandler);
router.get('/:name', getAuthorDetail as RequestHandler);

export default router;
