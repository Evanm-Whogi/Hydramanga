import { Router, RequestHandler } from 'express';
import { submitContact, submitDmca, submitMangaReport } from '@/controllers/contactController';
import { publicFormRateLimiter } from '@/middlewares/rateLimit';

const router = Router();

router.post('/contact', publicFormRateLimiter, submitContact as RequestHandler);
router.post('/dmca', publicFormRateLimiter, submitDmca as RequestHandler);
router.post('/manga-report', publicFormRateLimiter, submitMangaReport as RequestHandler);

export default router;
