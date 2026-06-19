import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '@/utils/auth';
import { siteSettingsService } from '@/services/siteSettingsService';

const MAINTENANCE_EXEMPT_PATHS = new Set(['/heartbeat', '/site-settings', '/admin/heartbeat']);

export async function isMaintenance(req: Request, res: Response, next: NextFunction): Promise<void> {
  const settings = await siteSettingsService.getSettings();
  if (!settings.maintenanceMode) {
    next();
    return;
  }

  const path = (req.originalUrl ?? req.path).split('?')[0];
  if (MAINTENANCE_EXEMPT_PATHS.has(path)) {
    next();
    return;
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role === 'admin') {
      next();
      return;
    }
  } catch {
    // Fall through to maintenance response
  }

  res.status(503).json({ message: 'The site is under maintenance. Please check back later.', code: 'MAINTENANCE' });
}
