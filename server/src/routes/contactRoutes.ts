import { Router, RequestHandler } from 'express';
import { submitContact, submitDmca, submitMangaReport } from '@/controllers/contactController';

const router = Router();

router.post('/contact', submitContact as RequestHandler);
router.post('/dmca', submitDmca as RequestHandler);
router.post('/manga-report', submitMangaReport as RequestHandler);

export default router;
