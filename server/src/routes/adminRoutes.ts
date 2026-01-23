import { Router, RequestHandler } from 'express';
import { triggerMangaSync, triggerMonitoredRescan, triggerTrendingRescan } from '@/controllers/mangaImportController';

const router = Router();

// Manga import/sync endpoints
router.get('/manga/sync', triggerMangaSync as RequestHandler);
router.get('/manga/rescan-monitored', triggerMonitoredRescan as RequestHandler);
router.get('/manga/rescan-trending', triggerTrendingRescan as RequestHandler);

// Health check
router.get('/heartbeat', (req, res) => {
    res.json({ status: 200, message: 'Service is healthy' });
});

export default router;
