import { Request, Response, NextFunction } from 'express';
import { siteSettingsService, type SiteSettingsUpdate } from '@/services/siteSettingsService';
import logger from '@/services/loggerService';

function parseOptionalText(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new Error(`${field} must be a string or null`);
}

export async function getAdminSiteSettings(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const settings = await siteSettingsService.getSettings();
    return res.json({ status: 200, settings });
  } catch (error) {
    logger.error(`Failed to get admin site settings: ${error}`, { service: 'adminSiteSettingsController' });
    return next(error);
  }
}

export async function patchAdminSiteSettings(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const body = req.body ?? {};
    const updates: SiteSettingsUpdate = {};

    try {
      const maintenanceMessage = parseOptionalText(body.maintenanceMessage, 'maintenanceMessage');
      if (maintenanceMessage !== undefined) updates.maintenanceMessage = maintenanceMessage;
      const welcomeModalTitle = parseOptionalText(body.welcomeModalTitle, 'welcomeModalTitle');
      if (welcomeModalTitle !== undefined) updates.welcomeModalTitle = welcomeModalTitle;
      const welcomeModalDescription = parseOptionalText(body.welcomeModalDescription, 'welcomeModalDescription');
      if (welcomeModalDescription !== undefined) updates.welcomeModalDescription = welcomeModalDescription;
      const welcomeModalBody = parseOptionalText(body.welcomeModalBody, 'welcomeModalBody');
      if (welcomeModalBody !== undefined) updates.welcomeModalBody = welcomeModalBody;
    } catch (validationError) {
      return res.status(400).json({ message: validationError instanceof Error ? validationError.message : 'Invalid input' });
    }

    const booleanFields: (keyof SiteSettingsUpdate)[] = [
      'registrationEnabled',
      'maintenanceMode',
      'importRequestsEnabled',
      'oauthGoogleEnabled',
      'oauthDiscordEnabled',
      'welcomeModalEnabled',
    ];
    for (const field of booleanFields) {
      if (body[field] === undefined) continue;
      if (typeof body[field] !== 'boolean') {
        return res.status(400).json({ message: `${field} must be a boolean` });
      }
      (updates as Record<string, boolean>)[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const settings = await siteSettingsService.updateSettings(updates);
    return res.json({ status: 200, settings });
  } catch (error) {
    logger.error(`Failed to update site settings: ${error}`, { service: 'adminSiteSettingsController' });
    return next(error);
  }
}
