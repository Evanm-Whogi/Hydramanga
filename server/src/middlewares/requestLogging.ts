import {randomUUID} from 'crypto';
import {Request, Response, NextFunction} from 'express';
import logger from '@/services/loggerService';

const SKIP_PATH_FRAGMENTS = ['/heartbeat', '/socket.io', '/metrics'];

function shouldSkip(url: string): boolean {
  return SKIP_PATH_FRAGMENTS.some((fragment) => url.includes(fragment));
}

function contentLengthHeader(value: string | number | string[] | undefined): number | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : String(value);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Structured Option-A access logging for every Express request.
 * Logs on response finish so auth middleware can populate req.user first.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.trim()) || randomUUID();
  res.setHeader('x-request-id', requestId);
  (req as any).requestId = requestId;

  if (shouldSkip(req.originalUrl || req.url)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const tracking = (req as any).trackingData || {};
    const user = (req as any).user;

    logger.info({
      message: 'http_request',
      type: 'access',
      method: req.method,
      path: req.path,
      query: req.query && Object.keys(req.query).length > 0 ? req.query : undefined,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: tracking.ipAddress || req.ip || 'unknown',
      userId: user?.id,
      username: user?.username,
      userAgent: tracking.userAgent || req.headers['user-agent'] || 'unknown',
      referer: req.headers['referer'] || req.headers['referrer'],
      reqContentLength: contentLengthHeader(req.headers['content-length']),
      resContentLength: contentLengthHeader(res.getHeader('content-length')),
      requestId,
    });
  });

  next();
}
