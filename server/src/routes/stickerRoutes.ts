import { Router, RequestHandler } from 'express';
import { listStickers } from '@/controllers/stickerController';

const router = Router();

router.get('/', listStickers as RequestHandler);

export default router;
