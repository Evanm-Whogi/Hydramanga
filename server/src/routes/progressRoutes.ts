import { Router } from 'express';
import { streamMangaProgress, getMangaProgress } from '@/controllers/progressController';

const router = Router();

// SSE endpoint for real-time progress streaming
router.get('/:id/stream', streamMangaProgress as any);

// REST endpoint for polling fallback
router.get('/:id', getMangaProgress as any);

export default router;
