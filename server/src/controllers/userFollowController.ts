import { Request, Response, NextFunction } from 'express';
import { userFollowService } from '@/services/userFollowService';

export async function followUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const result = await userFollowService.followUser(req.user!.id, req.params.identifier);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === 'User not found') return res.status(404).json({ message: error.message });
    if (error?.message === 'Cannot follow yourself') return res.status(400).json({ message: error.message });
    return next(error);
  }
}

export async function unfollowUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const result = await userFollowService.unfollowUser(req.user!.id, req.params.identifier);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.message === 'User not found') return res.status(404).json({ message: error.message });
    return next(error);
  }
}
