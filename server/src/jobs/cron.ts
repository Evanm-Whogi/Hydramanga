// src/jobs/cron.ts
import cron, { ScheduledTask } from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import { queueService } from '@/services/queueService';
import { mangaOrchestratorService } from '@/services/mangaOrchestratorService';
import logger from '@/services/loggerService';
import axios from 'axios';

const cronTasks: ScheduledTask[] = [];

export const initCronJobs = () => {
  
  // Full metadata sync (manual toggle): every Sunday at 02:00
  if (process.env.ENABLE_IMPORT_CRON === 'true') {
    const task = cron.schedule('0 2 * * 0', async () => {
      logger.info('[CRON] Triggering Manga Metadata Sync', { service: 'cronJobs' });
     
      const downloadDir = path.resolve(process.cwd(), '../data', 'imports');
      const tarGzPath = path.join(downloadDir, 'series.sqlite.tar.gz');
      const extractedPath = path.join(downloadDir, 'series.sqlite');
      
      try {
        // Ensure download directory exists
        await fs.mkdir(downloadDir, { recursive: true });
        
        // Download the tar.gz file
        logger.info('[CRON] Downloading series.sqlite.tar.gz...', { service: 'cronJobs' });
        const response = await axios.get('https://api.mangabaka.dev/v1/database/series.sqlite.tar.gz', {
          responseType: 'stream',
          timeout: 300000 // 5 minute timeout for large file
        });
        
        // Save tar.gz to disk
        await pipeline(
          response.data,
          createWriteStream(tarGzPath)
        );
        logger.info('[CRON] Downloaded series.sqlite.tar.gz successfully', { service: 'cronJobs' });
        
        // Extract tar.gz
        logger.info('[CRON] Extracting tar.gz...', { service: 'cronJobs' });
        await extract({
          file: tarGzPath,
          cwd: downloadDir,
          filter: (filePath) => filePath.endsWith('.sqlite') // Only extract .sqlite files
        });
        
        // Verify extracted file exists
        try {
          await fs.access(extractedPath);
          const stats = await fs.stat(extractedPath);
          logger.info(`[CRON] Extraction successful, SQLite file ready (${(stats.size / 1024 / 1024).toFixed(2)} MB)`, { service: 'cronJobs' });
        } catch {
          throw new Error('SQLite file not found after extraction');
        }
        
        // Clean up tar.gz
        await fs.unlink(tarGzPath).catch(() => {});
        
        // Queue the import job
        await queueService.addJob('mangaImportQueue', 'fullSync', { filePath: extractedPath }, { jobId: 'weekly-import' });
        logger.info('[CRON] Queued manga import job', { service: 'cronJobs' });
        
      } catch (error) {
        logger.error('[CRON] Failed to download/extract series database', { service: 'cronJobs', error });
        // Clean up partial files on error
        await fs.unlink(tarGzPath).catch(() => {});
        await fs.unlink(extractedPath).catch(() => {});
      }
    });
    cronTasks.push(task);
  }

  // Trending chapter refresh: configurable schedule (default: every 2 days at 03:00)
  const trendingSchedule = process.env.TRENDING_SCAN_SCHEDULE || '0 3 */2 * *';
  const trendingLimit = Number(process.env.TRENDING_LIMIT) || 100;
  const trendingTask = cron.schedule(trendingSchedule, async () => {
    logger.info(`[CRON] Queuing trending chapter refresh (top ${trendingLimit})`, { service: 'cronJobs' });
    await mangaOrchestratorService.enqueueTrendingChapterScans(trendingLimit);
  });
  cronTasks.push(trendingTask);

  // Monitored manga rescan: configurable schedule (default: every Saturday at 04:00)
  const monitoredSchedule = process.env.MONITORED_SCAN_SCHEDULE || '0 4 * * 6';
  const monitoredTask = cron.schedule(monitoredSchedule, async () => {
    logger.info('[CRON] Queuing monitored manga rescans (all with chapters)', { service: 'cronJobs' });
    await mangaOrchestratorService.enqueueMonitoredRescans();
  });
  cronTasks.push(monitoredTask);
};

export const stopCronJobs = () => {
  cronTasks.forEach(task => task.stop());
  logger.info('All cron jobs stopped', { service: 'cronJobs' });
};