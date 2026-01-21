/**
 * Email Job Handler
 * Processes email queue jobs
 */
import { IJobHandler } from './IJobHandler';
import { emailService } from '@/services/emailService';
import logger from '@/services/loggerService';

export class EmailJobHandler implements IJobHandler {
  canHandle(queueName: string): boolean {
    return queueName === 'emailQueue';
  }

  async handle(data: any): Promise<void> {
    try {
      logger.info(`Processing email job with data: ${JSON.stringify(data)}`, { service: 'emailJobHandler' });
      await emailService.processEmailJob(data);
    } catch (error) {
      logger.error(`Email job handler failed: ${error}`, { service: 'emailJobHandler' });
      throw error;
    }
  }
}
