import { Request, Response, NextFunction } from 'express';
import { badgeService } from '@/services/badgeService';

export async function claimEasterEggBadge(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.id;
    const granted = await badgeService.grantBadge(userId, 'easter_egg_hunter');
    return res.json({ success: true, granted });
  } catch (error) {
    return next(error);
  }
}
