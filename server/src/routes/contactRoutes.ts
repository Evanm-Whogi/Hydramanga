import { Router, RequestHandler } from 'express';
import { submitContact, submitDmca } from '@/controllers/contactController';

const router = Router();

router.post('/contact', submitContact as RequestHandler);
router.post('/dmca', submitDmca as RequestHandler);

export default router;
