// src/jobs/cron.ts
import cron from 'node-cron';
import path from 'path';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';

export const initCronJobs = () => {
  
  // Full metadata sync (manual toggle): every Sunday at 02:00
  if (process.env.ENABLE_IMPORT_CRON === 'true') {
    cron.schedule('0 2 * * 0', async () => {
      console.log('[CRON] Triggering Manga Metadata Sync');
      const filePath = path.resolve(process.cwd(), 'src/series.json');
      await queueService.addJob('mangaImportQueue', 'fullSync', { filePath }, { jobId: 'weekly-import' });
    });
  }

  // Trending chapter refresh: configurable schedule (default: every 2 days at 03:00)
  const trendingSchedule = process.env.TRENDING_SCAN_SCHEDULE || '0 3 */2 * *';
  const trendingLimit = Number(process.env.TRENDING_LIMIT) || 100;
  cron.schedule(trendingSchedule, async () => {
    console.log(`[CRON] Queuing trending chapter refresh (top ${trendingLimit})`);
    await mangaOrchestratorService.enqueueTrendingChapterScans(trendingLimit);
  });

  // Monitored manga rescan: configurable schedule (default: every Saturday at 04:00)
  const monitoredSchedule = process.env.MONITORED_SCAN_SCHEDULE || '0 4 * * 6';
  cron.schedule(monitoredSchedule, async () => {
    console.log('[CRON] Queuing monitored manga rescans (all with chapters)');
    await mangaOrchestratorService.enqueueMonitoredRescans();
  });
};