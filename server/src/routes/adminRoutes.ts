import { Router, RequestHandler } from 'express';
import { triggerMangaSync, triggerMonitoredRescan, triggerTrendingRescan } from '@/controllers/mangaImportController';
import { adminScraperSearch, adminSetSource, adminAddSecondaryTitle, adminTriggerRescan, adminGetSource, adminClearSource, adminCancelScan, adminDeleteChapters, adminUpdateSeries } from '@/controllers/adminMangaController';
import { listAdminManga } from '@/controllers/adminMangaListController';
import { getAdminOverviewStats, getAdminTimeseries } from '@/controllers/adminStatsController';
import { listAdminUsers, getAdminUser, patchAdminUser } from '@/controllers/adminUserController';
import { listAdminImportRequests, patchAdminImportRequest } from '@/controllers/importRequestController';
import { listAdminQueues, listAdminQueueJobs } from '@/controllers/adminQueueController';
import { requireRole } from '@/middlewares/requireRole';

const router = Router();

// Stats
router.get('/stats/overview', requireRole('admin'), getAdminOverviewStats as RequestHandler);
router.get('/stats/timeseries', requireRole('admin'), getAdminTimeseries as RequestHandler);

// Users
router.get('/users', requireRole('admin'), listAdminUsers as RequestHandler);
router.get('/users/:id', requireRole('admin'), getAdminUser as RequestHandler);
router.patch('/users/:id', requireRole('admin'), patchAdminUser as RequestHandler);

router.get('/manga', requireRole('admin'), listAdminManga as RequestHandler);

// Import requests
router.get('/import-requests', requireRole('admin'), listAdminImportRequests as RequestHandler);
router.patch('/import-requests/:id', requireRole('admin'), patchAdminImportRequest as RequestHandler);

// Queues
router.get('/queues', requireRole('admin'), listAdminQueues as RequestHandler);
router.get('/queues/:name/jobs', requireRole('admin'), listAdminQueueJobs as RequestHandler);

// Manga import/sync endpoints
router.get('/manga/sync', requireRole('admin'), triggerMangaSync as RequestHandler);
router.get('/manga/rescan-monitored', requireRole('admin'), triggerMonitoredRescan as RequestHandler);
router.get('/manga/rescan-trending', requireRole('admin'), triggerTrendingRescan as RequestHandler);
router.get('/manga/:id/scraper-search', requireRole('admin'), adminScraperSearch as RequestHandler);
router.get('/manga/:id/source', requireRole('admin'), adminGetSource as RequestHandler);
router.delete('/manga/:id/source', requireRole('admin'), adminClearSource as RequestHandler);
router.patch('/manga/:id/source', requireRole('admin'), adminSetSource as RequestHandler);
router.patch('/manga/:id', requireRole('admin'), adminUpdateSeries as RequestHandler);
router.patch('/manga/:id/secondary-titles', requireRole('admin'), adminAddSecondaryTitle as RequestHandler);
router.post('/manga/:id/rescan', requireRole('admin'), adminTriggerRescan as RequestHandler);
router.post('/manga/:id/cancel-scan', requireRole('admin'), adminCancelScan as RequestHandler);
router.delete('/manga/:id/chapters', requireRole('admin'), adminDeleteChapters as RequestHandler);

// Health check
router.get('/heartbeat', requireRole('admin'), (req, res) => {
    res.json({ status: 200, message: 'Service is healthy' });
});

export default router;
