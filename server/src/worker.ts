import dotenv from 'dotenv';
dotenv.config();
import 'tsconfig-paths/register';

import { initSentry } from '@/sentry';
import '@/services/loggerService';
import logger from '@/services/loggerService';
import { queueService } from '@/services/queueService';
import { initializeScrapers } from '@/scrapers';
import { mangaRecoveryService } from '@/services/mangaRecoveryService';
import { initCronJobs, stopCronJobs } from '@/jobs/cron';

if (process.env.ENABLE_SENTRY === 'true') {
    initSentry();
}

async function main() {
    // Eagerly create all queues so workers start (RUN_WORKERS=true in worker container)
    queueService.getQueue('mangaImportQueue');
    queueService.getQueue('mangaChapterImportQueue');
    queueService.getQueue('mangaChapterDownloadQueue');
    queueService.getQueue('storageCleanupQueue');
    queueService.getQueue('emailQueue');

    initializeScrapers();

    try {
        await mangaRecoveryService.recoverIncompleteDownloads();
    } catch (error) {
        logger.error(`Failed to run recovery service: ${error}`, { service: 'worker' });
    }

    initCronJobs();
    logger.info('Worker started: queues, scrapers, cron, and recovery initialized', { service: 'worker' });
}

const gracefulShutdown = async () => {
    logger.info('Worker received shutdown signal, starting graceful shutdown...');

    try {
        stopCronJobs();
        logger.info('Cron jobs stopped', { service: 'worker' });

        await queueService.closeAll();
        logger.info('Queue service closed', { service: 'worker' });

        const { pool } = await import('@/db/index');
        await pool.end();
        logger.info('Database pool closed', { service: 'worker' });

        logger.info('Worker graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error(`Error during worker shutdown: ${error}`, { service: 'worker' });
        process.exit(1);
    }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

main().catch((err) => {
    logger.error(`Worker failed to start: ${err}`, { service: 'worker' });
    process.exit(1);
});
