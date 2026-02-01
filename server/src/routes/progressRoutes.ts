import { Router } from 'express';
import { getMangaProgress } from '@/controllers/progressController';

const router = Router();

router.get('/:id', getMangaProgress as any);

export default router;
