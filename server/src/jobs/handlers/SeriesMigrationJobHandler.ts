import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { seriesMigrationService, type SeriesMigrationJobPayload } from '@/services/seriesMigrationService';
import logger from '@/services/loggerService';

export class SeriesMigrationJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'seriesMigrationQueue';
  }

  async handle(data: SeriesMigrationJobPayload, job?: Job): Promise<void> {
    const result = await seriesMigrationService.migrateSeries(data, job);
    if (result.diskFailures.length > 0) {
      logger.warn(`Series migration ${data.sourceSeriesId} → ${data.targetSeriesId} completed with ${result.diskFailures.length} disk failure(s)`, { service: 'seriesMigrationJobHandler', diskFailures: result.diskFailures });
    } else {
      logger.info(`Series migration ${data.sourceSeriesId} → ${data.targetSeriesId} completed: ${result.migratedCount} chapters, ${result.conflictCount} conflicts`, { service: 'seriesMigrationJobHandler' });
    }
  }
}
