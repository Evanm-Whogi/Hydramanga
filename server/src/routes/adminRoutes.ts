import { Router, RequestHandler } from 'express';
import { triggerMangaSync, triggerMonitoredRescan, triggerTrendingRescan } from '@/controllers/mangaImportController';
import { requireRole } from '@/middlewares/requireRole';

const router = Router();

// Manga import/sync endpoints
router.get('/manga/sync', requireRole('admin'), triggerMangaSync as RequestHandler);
router.get('/manga/rescan-monitored', requireRole('admin'), triggerMonitoredRescan as RequestHandler);
router.get('/manga/rescan-trending', requireRole('admin'), triggerTrendingRescan as RequestHandler);

// Health check
router.get('/heartbeat', (req, res) => {
    res.json({ status: 200, message: 'Service is healthy' });
});

export default router;
