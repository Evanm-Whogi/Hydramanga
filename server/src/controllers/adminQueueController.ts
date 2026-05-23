import { Request, Response, NextFunction } from 'express';
import { adminQueueService, ADMIN_QUEUE_JOB_STATES } from '@/services/adminQueueService';
import logger from '@/services/loggerService';

export async function listAdminQueues(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const result = await adminQueueService.listQueues();
    return res.json({ status: 200, ...result });
  } catch (error) {
    logger.error(`Failed to list admin queues: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}

export async function listAdminQueueJobs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    if (!queueName) return res.status(400).json({ message: 'Queue name is required' });

    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 25);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 25;
    const stateParam = typeof req.query.state === 'string' ? req.query.state : 'waiting';
    const state = ADMIN_QUEUE_JOB_STATES.includes(stateParam as (typeof ADMIN_QUEUE_JOB_STATES)[number])
      ? (stateParam as (typeof ADMIN_QUEUE_JOB_STATES)[number])
      : 'waiting';

    const result = await adminQueueService.listQueueJobs(queueName, { state, page, limit });

    if ('error' in result) {
      if (result.error === 'not_found') {
        return res.status(404).json({ message: 'Queue not found' });
      }
      return res.status(503).json({ message: result.message ?? 'Queue unavailable' });
    }

    return res.json({ status: 200, ...result });
  } catch (error) {
    logger.error(`Failed to list admin queue jobs: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}
