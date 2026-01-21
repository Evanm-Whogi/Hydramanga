/**
 * Job Handler Interface
 * Defines the contract for all job handlers
 */
import { Job } from 'bullmq';

export interface IJobHandler {
  /**
   * Check if this handler can process the given queue
   */
  canHandle(queueName: string): boolean;

  /**
   * Process the job
   */
  handle(data: any, job?: Job): Promise<void>;
}
