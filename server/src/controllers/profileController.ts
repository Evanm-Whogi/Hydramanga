import { Request, Response, NextFunction } from 'express';
import { profileService } from '@/services/profileService';

export async function getPublicProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.params.identifier;
    const viewerId = req.user?.id;
    if (!viewerId) return res.status(401).json({ message: 'Unauthorized' });

    const profile = await profileService.getPublicProfile(identifier, viewerId);
    if (!profile) return res.status(404).json({ message: 'User not found' });
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
}
