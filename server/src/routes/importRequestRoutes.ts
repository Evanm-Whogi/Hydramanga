import { Router, RequestHandler } from 'express';
import { createImportRequest, listMyImportRequests } from '@/controllers/importRequestController';

const router = Router();

router.post('/', createImportRequest as RequestHandler);
router.get('/mine', listMyImportRequests as RequestHandler);

export default router;
