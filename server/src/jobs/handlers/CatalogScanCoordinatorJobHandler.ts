import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { CATALOG_SCAN_COORDINATOR_QUEUE, catalogScanService } from '@/services/catalogScanService';
import { appConfig } from '@/config/appConfig';
import logger from '@/services/loggerService';

export class CatalogScanCoordinatorJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === CATALOG_SCAN_COORDINATOR_QUEUE;
  }

  async handle(_data: unknown, _job?: Job): Promise<void> {
    try {
      await catalogScanService.processTick();
    } catch (err) {
      logger.error(`Catalog scan coordinator tick failed: ${(err as Error).message}`, { service: 'catalogScanCoordinatorJobHandler' });
      await catalogScanService.rescheduleIfActive(appConfig.catalogScan.pollIntervalMs);
      throw err;
    }
  }
}
