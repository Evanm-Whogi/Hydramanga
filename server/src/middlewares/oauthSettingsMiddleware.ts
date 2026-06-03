import { Request, Response, NextFunction } from 'express';
import { siteSettingsService } from '@/services/siteSettingsService';

export async function oauthSettingsMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = (req.path ?? '').toLowerCase();
  if (!path.includes('google') && !path.includes('discord')) {
    next();
    return;
  }

  const settings = await siteSettingsService.getSettings();
  if (path.includes('google') && !settings.oauthGoogleEnabled) {
    res.status(403).json({ message: 'Google sign-in is currently disabled.' });
    return;
  }
  if (path.includes('discord') && !settings.oauthDiscordEnabled) {
    res.status(403).json({ message: 'Discord sign-in is currently disabled.' });
    return;
  }
  next();
}
