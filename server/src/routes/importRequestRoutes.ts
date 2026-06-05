import { Router, RequestHandler } from 'express';
import { createImportRequest, listMyImportRequests } from '@/controllers/importRequestController';
import { importRequestRateLimit } from '@/middlewares/userActionRateLimit';

const router = Router();

router.post('/', importRequestRateLimit, createImportRequest as RequestHandler);
router.get('/mine', listMyImportRequests as RequestHandler);

export default router;
