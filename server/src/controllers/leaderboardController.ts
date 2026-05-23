import { Request, Response, NextFunction } from 'express';
import { leaderboardService } from '@/services/leaderboardService';

export async function getLeaderboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await leaderboardService.getSummary();
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
}

export async function getLeaderboardCommenters(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 50);
    const rows = await leaderboardService.getTopCommenters(limit);
    return res.json({ rows });
  } catch (error) {
    return next(error);
  }
}

export async function getLeaderboardReaders(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 50);
    const rows = await leaderboardService.getTopReaders(limit);
    return res.json({ rows });
  } catch (error) {
    return next(error);
  }
}

export async function getLeaderboardStreaks(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 50);
    const rows = await leaderboardService.getTopStreaks(limit);
    return res.json({ rows });
  } catch (error) {
    return next(error);
  }
}
