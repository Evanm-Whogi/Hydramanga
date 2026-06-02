import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to extract and attach tracking data to the request object.
 * userId is filled later by authMiddleware when the request is authenticated.
 */
export async function trackingMiddleware(req: Request, res: Response, next: NextFunction) {
  let ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown';

  if (ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.substring(7);
  }

  const userAgent = req.headers['user-agent'] || 'unknown';

  (req as any).trackingData = {
    ipAddress,
    userAgent,
  };

  next();
}
