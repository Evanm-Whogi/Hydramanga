import { Router, RequestHandler } from 'express';
import { triggerMangaSync, triggerMonitoredRescan, triggerTrendingRescan } from '@/controllers/mangaImportController';
import { adminScraperSearch, adminSetSource, adminAddSecondaryTitle, adminTriggerRescan } from '@/controllers/adminMangaController';
import { requireRole } from '@/middlewares/requireRole';

const router = Router();

// Manga import/sync endpoints
router.get('/manga/sync', requireRole('admin'), triggerMangaSync as RequestHandler);
router.get('/manga/rescan-monitored', requireRole('admin'), triggerMonitoredRescan as RequestHandler);
router.get('/manga/rescan-trending', requireRole('admin'), triggerTrendingRescan as RequestHandler);
router.get('/manga/:id/scraper-search', requireRole('admin'), adminScraperSearch as RequestHandler);
router.patch('/manga/:id/source', requireRole('admin'), adminSetSource as RequestHandler);
router.patch('/manga/:id/secondary-titles', requireRole('admin'), adminAddSecondaryTitle as RequestHandler);
router.post('/manga/:id/rescan', requireRole('admin'), adminTriggerRescan as RequestHandler);

// Health check
router.get('/heartbeat', (req, res) => {
    res.json({ status: 200, message: 'Service is healthy' });
});

export default router;
