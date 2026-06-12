import { Request, Response, NextFunction } from 'express';
import { BADGE_DEFINITIONS, BADGE_PILLAR_ORDER, type BadgeCategory } from '@/config/badgeConfig';

export async function listAdminBadges(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const grouped = BADGE_PILLAR_ORDER.reduce<Record<BadgeCategory, typeof BADGE_DEFINITIONS>>((acc, pillar) => {
      acc[pillar] = BADGE_DEFINITIONS.filter((b) => b.category === pillar);
      return acc;
    }, {} as Record<BadgeCategory, typeof BADGE_DEFINITIONS>);
    return res.json({ status: 200, badges: BADGE_DEFINITIONS, grouped });
  } catch (error) {
    return next(error);
  }
}
