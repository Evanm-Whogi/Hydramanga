/**
 * Archive Maintenance Job Handler (worker-only).
 *
 * Runs operator cleanup that needs the scratch-disk mount and qBittorrent access —
 * both of which the API container lacks. The admin controller enqueues these:
 *   - purge        → reconcile client + scratch disk against the job table
 *   - removeTorrent → drop one torrent (stop seeding) + optionally delete its files
 */
import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { ARCHIVE_MAINTENANCE_QUEUE, type ArchiveMaintenanceJobData } from './archiveQueueNames';
import logger from '@/services/loggerService';
import { archiveMaintenanceService } from '@/services/archiveMaintenanceService';

export class ArchiveMaintenanceJobHandler implements IJobHandler {
    canHandle(queueName: string): boolean {
        return queueName === ARCHIVE_MAINTENANCE_QUEUE;
    }

    async handle(data: ArchiveMaintenanceJobData, _job?: Job): Promise<void> {
        if (data.action === 'purge') {
            const result = await archiveMaintenanceService.purgeOrphans();
            logger.info(`[MAINT] Purge done: ${JSON.stringify(result)}`, { service: 'archiveMaintenanceJobHandler' });
            return;
        }
        if (data.action === 'removeTorrent') {
            await archiveMaintenanceService.removeTorrentAndFiles(data.handle, data.deleteFiles, data.localPath);
            logger.info(`[MAINT] Removed torrent ${data.handle} (deleteFiles=${data.deleteFiles})`, { service: 'archiveMaintenanceJobHandler' });
        }
    }
}
