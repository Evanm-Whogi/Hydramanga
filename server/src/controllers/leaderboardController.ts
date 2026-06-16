import { Request, Response, NextFunction } from 'express';
import { leaderboardService, LeaderboardPeriod, LeaderboardTab } from '@/services/leaderboardService';

const VALID_TABS: LeaderboardTab[] = ['overall', 'chapters', 'streaks', 'comments', 'reviews'];
const VALID_PERIODS: LeaderboardPeriod[] = ['all', 'month', 'week', 'day'];

function parseTab(value: unknown): LeaderboardTab {
  const tab = typeof value === 'string' ? value : 'overall';
  return VALID_TABS.includes(tab as LeaderboardTab) ? (tab as LeaderboardTab) : 'overall';
}

function parsePeriod(value: unknown): LeaderboardPeriod {
  const period = typeof value === 'string' ? value : 'all';
  return VALID_PERIODS.includes(period as LeaderboardPeriod) ? (period as LeaderboardPeriod) : 'all';
}

export async function getLeaderboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await leaderboardService.getSummary();
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
}

export async function getLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const tab = parseTab(req.query.tab);
    const period = tab === 'overall' ? parsePeriod(req.query.period) : 'all';
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 50);
    const result = await leaderboardService.getLeaderboard({ tab, period, page, limit });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
