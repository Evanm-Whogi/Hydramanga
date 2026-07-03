import { Request, Response, NextFunction } from 'express';
import logger from '@/services/loggerService';
import { catalogScanService } from '@/services/catalogScanService';

function parseStartBody(req: Request) {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const batchSize = body.batchSize != null ? Number(body.batchSize) : undefined;
  const type = typeof body.type === 'string' && body.type.trim() && body.type !== 'all' ? body.type.trim() : undefined;
  return {
    batchSize: Number.isFinite(batchSize) ? batchSize : undefined,
    type,
    skipWithChapters: body.skipWithChapters !== undefined ? (body.skipWithChapters === true || body.skipWithChapters === 'true') : undefined,
    autoSelectSource: body.autoSelectSource !== undefined ? (body.autoSelectSource !== false && body.autoSelectSource !== 'false') : undefined,
    useArchive: body.useArchive !== undefined ? (body.useArchive !== false && body.useArchive !== 'false') : undefined,
    resume: body.resume === true || body.resume === 'true',
  };
}

export const getCatalogScanState = async (_req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const state = await catalogScanService.getState();
    return res.json({ state });
  } catch (error: any) {
    logger.error(`Failed to get catalog scan state: ${error.message}`, { service: 'catalogScanController' });
    return next(error);
  }
};

export const startCatalogScan = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const options = parseStartBody(req);
    const state = await catalogScanService.start(options);
    return res.status(202).json({ message: 'Catalog scan started', state });
  } catch (error: any) {
    if (error.message === 'Catalog scan is already active') {
      return res.status(409).json({ error: error.message });
    }
    logger.error(`Failed to start catalog scan: ${error.message}`, { service: 'catalogScanController' });
    return next(error);
  }
};

export const stopCatalogScan = async (_req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const state = await catalogScanService.stop();
    return res.json({ message: 'Catalog scan stop requested', state });
  } catch (error: any) {
    logger.error(`Failed to stop catalog scan: ${error.message}`, { service: 'catalogScanController' });
    return next(error);
  }
};

export const forceStopCatalogScan = async (_req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const state = await catalogScanService.forceStop();
    return res.json({ message: 'Catalog scan force-stopped', state });
  } catch (error: any) {
    logger.error(`Failed to force-stop catalog scan: ${error.message}`, { service: 'catalogScanController' });
    return next(error);
  }
};

export const resetCatalogScan = async (_req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const state = await catalogScanService.reset();
    return res.json({ message: 'Catalog scan reset', state });
  } catch (error: any) {
    if (error.message === 'Cannot reset while catalog scan is active') {
      return res.status(409).json({ error: error.message });
    }
    logger.error(`Failed to reset catalog scan: ${error.message}`, { service: 'catalogScanController' });
    return next(error);
  }
};
