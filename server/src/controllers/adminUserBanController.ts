import { Request, Response, NextFunction } from 'express';
import { adminUserBanService } from '@/services/adminUserBanService';
import { adminUserService } from '@/services/adminUserService';
import logger from '@/services/loggerService';

export async function banAdminUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const adminId = req.user?.id as string | undefined;
    if (!adminId) return res.status(401).json({ message: 'Unauthorized' });

    const { banReason, banExpiresIn } = req.body ?? {};
    const expiresIn =
      banExpiresIn === undefined || banExpiresIn === null
        ? undefined
        : Number(banExpiresIn);

    if (expiresIn !== undefined && (!Number.isFinite(expiresIn) || expiresIn <= 0)) {
      return res.status(400).json({ message: 'banExpiresIn must be a positive number of seconds' });
    }

    const result = await adminUserBanService.banUser(userId, adminId, req.headers, {
      banReason: typeof banReason === 'string' ? banReason : undefined,
      banExpiresIn: expiresIn,
    });

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          return res.status(404).json({ message: 'User not found' });
        case 'cannot_ban_self':
          return res.status(400).json({ message: 'You cannot ban your own account' });
        case 'cannot_ban_admin':
          return res.status(400).json({ message: 'Admin accounts cannot be banned' });
        case 'already_banned':
          return res.status(400).json({ message: 'User is already banned' });
        default:
          return res.status(400).json({ message: 'Failed to ban user' });
      }
    }

    const user = await adminUserService.getUserForAdmin(userId);
    logger.info(`Admin ${adminId} banned user ${userId}`, { service: 'adminUserBanController' });

    return res.json({ status: 200, message: 'User banned', user });
  } catch (error) {
    logger.error(`Failed to ban user: ${error}`, { service: 'adminUserBanController' });
    return next(error);
  }
}

export async function unbanAdminUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const result = await adminUserBanService.unbanUser(userId, req.headers);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          return res.status(404).json({ message: 'User not found' });
        case 'not_banned':
          return res.status(400).json({ message: 'User is not banned' });
        default:
          return res.status(400).json({ message: 'Failed to unban user' });
      }
    }

    const user = await adminUserService.getUserForAdmin(userId);
    logger.info(`Admin ${req.user?.id} unbanned user ${userId}`, { service: 'adminUserBanController' });

    return res.json({ status: 200, message: 'User unbanned', user });
  } catch (error) {
    logger.error(`Failed to unban user: ${error}`, { service: 'adminUserBanController' });
    return next(error);
  }
}
