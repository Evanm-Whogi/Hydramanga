import { Router, RequestHandler } from 'express';
import { auditAdminMiddleware } from '@/middlewares/auditAdminMiddleware';
import { listAdminAuditLogs } from '@/controllers/adminAuditController';
import { triggerMangaSync, triggerMonitoredRescan, triggerTrendingRescan, triggerRankedScan } from '@/controllers/mangaImportController';
import { getCatalogScanState, startCatalogScan, stopCatalogScan, forceStopCatalogScan, resetCatalogScan } from '@/controllers/catalogScanController';
import { adminScraperSearch, adminSetSource, adminAddSecondaryTitle, adminTriggerRescan, adminTriggerArchiveImport, adminReingestArchive, adminGetSource, adminClearSource, adminCancelScan, adminDeleteChapters, adminUpdateSeries, adminMigrateSeries } from '@/controllers/adminMangaController';
import { listAdminManga, listAdminMangaScraperFilters, listAdminMangaTypeFilters } from '@/controllers/adminMangaListController';
import { getAdminOverviewStats, getAdminTimeseries } from '@/controllers/adminStatsController';
import { listAdminUsers, getAdminUser, patchAdminUser } from '@/controllers/adminUserController';
import {sendAdminUserVerification, sendAdminUserPasswordReset} from '@/controllers/adminUserActionsController';
import { banAdminUser, unbanAdminUser } from '@/controllers/adminUserBanController';
import { listAdminImportRequests, patchAdminImportRequest } from '@/controllers/importRequestController';
import {listAdminQueues, listAdminQueueJobs, pauseAdminQueue, resumeAdminQueue, promoteAdminQueueJob, removeAdminQueueJob, retryAdminQueueJob, clearAdminQueue} from '@/controllers/adminQueueController';
import { getAdminSiteSettings, patchAdminSiteSettings } from '@/controllers/adminSiteSettingsController';
import { requireRole } from '@/middlewares/requireRole';
import { listAdminStickers, createAdminSticker, updateAdminSticker, deleteAdminSticker, scanAdminStickers } from '@/controllers/adminStickerController';
import { listAdminLogContainers, getAdminContainerLogs } from '@/controllers/adminDockerLogController';
import { listAdminBadges } from '@/controllers/adminBadgeController';
import { listAdminArchiveJobs, getAdminSeriesArchiveStatus, retryAdminArchiveJob, dismissAdminArchiveJob, deleteAdminArchiveJob, abandonAdminArchiveTorrent, importVolumeFromArchiveJob, purgeOrphanedArchiveTorrents, getScraperEgressStatus, rotateScraperEgress } from '@/controllers/adminArchiveController';

const router = Router();

router.use(auditAdminMiddleware);

// Content stickers
router.get('/stickers', requireRole('admin'), listAdminStickers as RequestHandler);
router.post('/stickers/scan', requireRole('admin'), scanAdminStickers as RequestHandler);
router.post('/stickers', requireRole('admin'), createAdminSticker as RequestHandler);
router.patch('/stickers/:stickerId', requireRole('admin'), updateAdminSticker as RequestHandler);
router.delete('/stickers/:stickerId', requireRole('admin'), deleteAdminSticker as RequestHandler);

// Site settings
router.get('/settings', requireRole('admin'), getAdminSiteSettings as RequestHandler);
router.patch('/settings', requireRole('admin'), patchAdminSiteSettings as RequestHandler);

// Audit log
router.get('/audit', requireRole('admin'), listAdminAuditLogs as RequestHandler);

// Stats
router.get('/stats/overview', requireRole('admin'), getAdminOverviewStats as RequestHandler);
router.get('/stats/timeseries', requireRole('admin'), getAdminTimeseries as RequestHandler);

// Badges
router.get('/badges', requireRole('admin'), listAdminBadges as RequestHandler);

// Users
router.get('/users', requireRole('admin'), listAdminUsers as RequestHandler);
router.get('/users/:id', requireRole('admin'), getAdminUser as RequestHandler);
router.patch('/users/:id', requireRole('admin'), patchAdminUser as RequestHandler);
router.post('/users/:id/send-verification', requireRole('admin'), sendAdminUserVerification as RequestHandler);
router.post('/users/:id/send-password-reset', requireRole('admin'), sendAdminUserPasswordReset as RequestHandler);
router.post('/users/:id/ban', requireRole('admin'), banAdminUser as RequestHandler);
router.post('/users/:id/unban', requireRole('admin'), unbanAdminUser as RequestHandler);

router.get('/manga', requireRole('admin'), listAdminManga as RequestHandler);
router.get('/manga/scraper-filters', requireRole('admin'), listAdminMangaScraperFilters as RequestHandler);
router.get('/manga/type-filters', requireRole('admin'), listAdminMangaTypeFilters as RequestHandler);

// Import requests
router.get('/import-requests', requireRole('admin'), listAdminImportRequests as RequestHandler);
router.patch('/import-requests/:id', requireRole('admin'), patchAdminImportRequest as RequestHandler);

// Queues
router.get('/queues', requireRole('admin'), listAdminQueues as RequestHandler);
router.post('/queues/:name/pause', requireRole('admin'), pauseAdminQueue as RequestHandler);
router.post('/queues/:name/resume', requireRole('admin'), resumeAdminQueue as RequestHandler);
router.post('/queues/:name/clear', requireRole('admin'), clearAdminQueue as RequestHandler);
router.get('/queues/:name/jobs', requireRole('admin'), listAdminQueueJobs as RequestHandler);
router.post('/queues/:name/jobs/:jobId/retry', requireRole('admin'), retryAdminQueueJob as RequestHandler);
router.post('/queues/:name/jobs/:jobId/promote', requireRole('admin'), promoteAdminQueueJob as RequestHandler);
router.delete('/queues/:name/jobs/:jobId', requireRole('admin'), removeAdminQueueJob as RequestHandler);

// Archive (torrent) acquisition
router.get('/archive/jobs', requireRole('admin'), listAdminArchiveJobs as RequestHandler);
router.post('/archive/orphans/purge', requireRole('admin'), purgeOrphanedArchiveTorrents as RequestHandler);
router.post('/archive/jobs/:jobId/retry', requireRole('admin'), retryAdminArchiveJob as RequestHandler);
router.post('/archive/jobs/:jobId/dismiss', requireRole('admin'), dismissAdminArchiveJob as RequestHandler);
router.post('/archive/jobs/:jobId/abandon-torrent', requireRole('admin'), abandonAdminArchiveTorrent as RequestHandler);
router.post('/archive/jobs/:jobId/import-volume', requireRole('admin'), importVolumeFromArchiveJob as RequestHandler);
router.delete('/archive/jobs/:jobId', requireRole('admin'), deleteAdminArchiveJob as RequestHandler);

// Scraper egress (VPN) — current exit IP + manual rotation
router.get('/scrapers/egress-status', requireRole('admin'), getScraperEgressStatus as RequestHandler);
router.post('/scrapers/rotate-egress', requireRole('admin'), rotateScraperEgress as RequestHandler);

// Docker container logs
router.get('/logs/containers', requireRole('admin'), listAdminLogContainers as RequestHandler);
router.get('/logs/containers/:id', requireRole('admin'), getAdminContainerLogs as RequestHandler);

// Manga import/sync endpoints
router.get('/manga/sync', requireRole('admin'), triggerMangaSync as RequestHandler);
router.get('/manga/rescan-monitored', requireRole('admin'), triggerMonitoredRescan as RequestHandler);
router.get('/manga/rescan-trending', requireRole('admin'), triggerTrendingRescan as RequestHandler);
router.post('/manga/scan-ranked', requireRole('admin'), triggerRankedScan as RequestHandler);
router.get('/manga/catalog-scan', requireRole('admin'), getCatalogScanState as RequestHandler);
router.post('/manga/catalog-scan/start', requireRole('admin'), startCatalogScan as RequestHandler);
router.post('/manga/catalog-scan/stop', requireRole('admin'), stopCatalogScan as RequestHandler);
router.post('/manga/catalog-scan/force-stop', requireRole('admin'), forceStopCatalogScan as RequestHandler);
router.post('/manga/catalog-scan/reset', requireRole('admin'), resetCatalogScan as RequestHandler);
router.get('/manga/:id/scraper-search', requireRole('admin'), adminScraperSearch as RequestHandler);
router.get('/manga/:id/source', requireRole('admin'), adminGetSource as RequestHandler);
router.delete('/manga/:id/source', requireRole('admin'), adminClearSource as RequestHandler);
router.patch('/manga/:id/source', requireRole('admin'), adminSetSource as RequestHandler);
router.patch('/manga/:id', requireRole('admin'), adminUpdateSeries as RequestHandler);
router.patch('/manga/:id/secondary-titles', requireRole('admin'), adminAddSecondaryTitle as RequestHandler);
router.post('/manga/:id/rescan', requireRole('admin'), adminTriggerRescan as RequestHandler);
router.get('/manga/:id/archive-status', requireRole('admin'), getAdminSeriesArchiveStatus as RequestHandler);
router.post('/manga/:id/archive-import', requireRole('admin'), adminTriggerArchiveImport as RequestHandler);
router.post('/manga/:id/archive-reingest', requireRole('admin'), adminReingestArchive as RequestHandler);
router.post('/manga/:id/cancel-scan', requireRole('admin'), adminCancelScan as RequestHandler);
router.delete('/manga/:id/chapters', requireRole('admin'), adminDeleteChapters as RequestHandler);
router.post('/manga/:id/migrate', requireRole('admin'), adminMigrateSeries as RequestHandler);

export default router;
