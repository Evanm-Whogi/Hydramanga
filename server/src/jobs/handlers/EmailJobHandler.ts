/**
 * Email Job Handler
 * Processes email queue jobs
 */
import type { Job } from 'bullmq';
import { IJobHandler } from './IJobHandler';
import { emailService } from '@/services/emailService';
import logger from '@/services/loggerService';

export class EmailJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'emailQueue';
  }

  async handle(data: any, job?: Job): Promise<void> {
    try {
      logger.info(`Processing email job with data: ${JSON.stringify(data)}`, { service: 'emailJobHandler' });
      await emailService.processEmailJob(data, job);
    } catch (error) {
      logger.error(`Email job handler failed: ${error}`, { service: 'emailJobHandler' });
      throw error;
    }
  }
}
