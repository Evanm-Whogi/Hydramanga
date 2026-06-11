import { Request, Response, NextFunction } from 'express';
import { adminDockerLogService, type AdminDockerLogTail } from '@/services/adminDockerLogService';
import logger from '@/services/loggerService';

export async function listAdminLogContainers(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const result = await adminDockerLogService.listContainers();
    return res.json({ status: 200, ...result });
  } catch (error) {
    logger.error(`Failed to list admin log containers: ${error}`, { service: 'adminDockerLogController' });
    return next(error);
  }
}

export async function getAdminContainerLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const containerId = req.params.id;
    if (!containerId) return res.status(400).json({ message: 'Container id is required' });

    const rawTail = req.query.tail;
    let tail: AdminDockerLogTail | undefined;
    if (typeof rawTail === 'string' && rawTail.toLowerCase() === 'all') {
      tail = 'all';
    } else if (rawTail != null) {
      const parsed = Number(rawTail);
      if (Number.isFinite(parsed)) tail = parsed;
    }

    const result = await adminDockerLogService.getLogs(containerId, { tail });

    if ('error' in result) {
      if (result.error === 'not_found') {
        return res.status(404).json({ message: 'Container not found' });
      }
      return res.json({ status: 200, available: false, message: result.message });
    }

    return res.json({ status: 200, available: true, ...result });
  } catch (error) {
    logger.error(`Failed to get admin container logs: ${error}`, { service: 'adminDockerLogController' });
    return next(error);
  }
}
