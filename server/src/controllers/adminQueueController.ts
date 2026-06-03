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

function handleQueueActionError(res: Response, result: { error?: string; message?: string }): Response | null {
  if (!('error' in result) || !result.error) return null;
  if (result.error === 'not_found') {
    return res.status(404).json({ message: 'Queue not found' });
  }
  if (result.error === 'bad_request') {
    return res.status(400).json({ message: result.message ?? 'Invalid request' });
  }
  if (result.error === 'unavailable') {
    return res.status(503).json({ message: result.message ?? 'Queue unavailable' });
  }
  return null;
}

export async function retryAdminQueueJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    const jobId = req.params.jobId;
    if (!queueName || !jobId) return res.status(400).json({ message: 'Queue name and job ID are required' });

    const result = await adminQueueService.retryJob(queueName, jobId);
    if ('error' in result) {
      const errRes = handleQueueActionError(res, result);
      if (errRes) return errRes;
    }

    return res.json({ status: 200, success: true });
  } catch (error) {
    logger.error(`Failed to retry admin queue job: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}

export async function removeAdminQueueJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    const jobId = req.params.jobId;
    if (!queueName || !jobId) return res.status(400).json({ message: 'Queue name and job ID are required' });

    const force = req.query.force === 'true' || req.query.force === '1';
    const result = await adminQueueService.removeJob(queueName, jobId, { force });
    if ('error' in result) {
      const errRes = handleQueueActionError(res, result);
      if (errRes) return errRes;
    }

    return res.json({ status: 200, success: true, forced: 'forced' in result ? result.forced : false });
  } catch (error) {
    logger.error(`Failed to remove admin queue job: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}

export async function promoteAdminQueueJob(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    const jobId = req.params.jobId;
    if (!queueName || !jobId) return res.status(400).json({ message: 'Queue name and job ID are required' });

    const result = await adminQueueService.promoteJob(queueName, jobId);
    if ('error' in result) {
      const errRes = handleQueueActionError(res, result);
      if (errRes) return errRes;
    }

    return res.json({ status: 200, success: true });
  } catch (error) {
    logger.error(`Failed to promote admin queue job: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}

export async function pauseAdminQueue(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    if (!queueName) return res.status(400).json({ message: 'Queue name is required' });

    const result = await adminQueueService.pauseQueue(queueName);
    if ('error' in result) {
      const errRes = handleQueueActionError(res, result);
      if (errRes) return errRes;
    }

    return res.json({ status: 200, success: true });
  } catch (error) {
    logger.error(`Failed to pause admin queue: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}

export async function resumeAdminQueue(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    if (!queueName) return res.status(400).json({ message: 'Queue name is required' });

    const result = await adminQueueService.resumeQueue(queueName);
    if ('error' in result) {
      const errRes = handleQueueActionError(res, result);
      if (errRes) return errRes;
    }

    return res.json({ status: 200, success: true });
  } catch (error) {
    logger.error(`Failed to resume admin queue: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}

export async function clearAdminQueue(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const queueName = req.params.name;
    if (!queueName) return res.status(400).json({ message: 'Queue name is required' });

    const stateParam = typeof req.body?.state === 'string' ? req.body.state : undefined;
    const state = stateParam && ADMIN_QUEUE_JOB_STATES.includes(stateParam as (typeof ADMIN_QUEUE_JOB_STATES)[number])
      ? (stateParam as (typeof ADMIN_QUEUE_JOB_STATES)[number])
      : undefined;

    const result = await adminQueueService.clearQueue(queueName, state);
    if ('error' in result) {
      const errRes = handleQueueActionError(res, result);
      if (errRes) return errRes;
    }

    return res.json({ status: 200, success: true, removed: result.removed, state: result.state });
  } catch (error) {
    logger.error(`Failed to clear admin queue: ${error}`, { service: 'adminQueueController' });
    return next(error);
  }
}
