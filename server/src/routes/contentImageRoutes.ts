import { Router, RequestHandler } from 'express';
import { proxyContentImage } from '@/controllers/contentImageController';

const router = Router();

router.get('/proxy', proxyContentImage as RequestHandler);

export default router;
