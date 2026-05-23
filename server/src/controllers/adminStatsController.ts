import { Request, Response, NextFunction } from 'express';
import { adminStatsService } from '@/services/adminStatsService';
import logger from '@/services/loggerService';

export async function getAdminOverviewStats(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const stats = await adminStatsService.getOverviewStats();
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json({ status: 200, stats });

  } catch (error) {
    logger.error(`Failed to get admin overview stats: ${error}`, { service: 'adminStatsController' });
    return next(error);
  }
}

export async function getAdminTimeseries(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const rawDays = Number(req.query.days ?? 30);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.floor(rawDays), 7), 90) : 30;
    const timeseries = await adminStatsService.getTimeseries(days);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json({ status: 200, timeseries });

  } catch (error) {
    logger.error(`Failed to get admin timeseries: ${error}`, { service: 'adminStatsController' });
    return next(error);
  }
}
