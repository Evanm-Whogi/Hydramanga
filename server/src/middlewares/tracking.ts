import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '@/utils/auth';

/**
 * Middleware to extract and attach tracking data to the request object
 * This includes IP address and user agent for anonymous tracking
 * Optionally captures userId if session exists (non-blocking)
 */
export async function trackingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract IP address (handle proxies and load balancers)
  let ipAddress = 
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown';

  // Strip IPv6-mapped IPv4 prefix (::ffff:) to get clean IPv4 address
  if (ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.substring(7);
  }

  // Extract user agent
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Try to get session if available (non-blocking, doesn't require auth)
  let userId: string | undefined = undefined;
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    userId = session?.user?.id;
  } catch (error) {
    // Silently ignore auth errors - tracking should work for anonymous users
  }

  (req as any).trackingData = {
    ipAddress,
    userAgent,
    userId,
  };

  next();
}
