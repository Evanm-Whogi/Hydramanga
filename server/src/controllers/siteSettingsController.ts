import { Request, Response, NextFunction } from 'express';
import { siteSettingsService } from '@/services/siteSettingsService';
import logger from '@/services/loggerService';

export async function getPublicSiteSettings(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const settings = await siteSettingsService.getSettings();
    return res.json({ status: 200, settings: siteSettingsService.getPublicSettings(settings) });
  } catch (error) {
    logger.error(`Failed to get site settings: ${error}`, { service: 'siteSettingsController' });
    return next(error);
  }
}
