/**
 * Job Handler Registry
 * Manages all job handlers and routes jobs to appropriate handlers
 */
import { IJobHandler } from './IJobHandler';
import { EmailJobHandler } from './EmailJobHandler';
import { MangaImportJobHandler } from './MangaImportJobHandler';
import { MangaChapterImportJobHandler } from './MangaChapterImportJobHandler';
import { MangaChapterDownloadJobHandler } from './MangaChapterDownloadJobHandler';
import logger from '@/services/loggerService';

export class JobHandlerRegistry {
  private handlers: IJobHandler[] = [];

  constructor() {
    // Register all handlers
    this.registerHandler(new EmailJobHandler());
    this.registerHandler(new MangaImportJobHandler());
    this.registerHandler(new MangaChapterImportJobHandler());
    this.registerHandler(new MangaChapterDownloadJobHandler());
  }

  /**
   * Register a new job handler
   */
  registerHandler(handler: IJobHandler): void {
    this.handlers.push(handler);
    logger.debug(`Registered job handler: ${handler.constructor.name}`, { service: 'jobHandlerRegistry' });
  }

  /**
   * Get handler for a specific queue
   */
  getHandler(queueName: string): IJobHandler | undefined {
    return this.handlers.find(h => h.canHandle(queueName));
  }

  /**
   * Get all registered handlers
   */
  getAllHandlers(): IJobHandler[] {
    return [...this.handlers];
  }

  /**
   * Check if a queue has a registered handler
   */
  hasHandler(queueName: string): boolean {
    return this.handlers.some(h => h.canHandle(queueName));
  }
}

export const jobHandlerRegistry = new JobHandlerRegistry();
