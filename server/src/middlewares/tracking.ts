import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to extract and attach tracking data to the request object
 * This includes IP address and user agent for anonymous tracking
 */
export function trackingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract IP address (handle proxies and load balancers)
  const ipAddress = 
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown';

  // Extract user agent
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Attach to request object for easy access
  (req as any).trackingData = {
    ipAddress,
    userAgent,
    userId: (req as any).user?.id || undefined,
  };

  next();
}
