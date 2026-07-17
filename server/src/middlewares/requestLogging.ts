import {randomUUID} from 'crypto';
import {Request, Response, NextFunction} from 'express';
import logger from '@/services/loggerService';

const SKIP_PATH_FRAGMENTS = ['/heartbeat', '/socket.io', '/metrics'];
/** Uptime / probe clients — skip access logs (Loki + files); they already have their own metrics. */
const SKIP_USER_AGENT_FRAGMENTS = ['blackbox-exporter', 'hetrixtools'];

function requestUserAgent(req: Request): string {
  const tracking = (req as any).trackingData?.userAgent;
  if (typeof tracking === 'string' && tracking) return tracking;
  const header = req.headers['user-agent'];
  return (Array.isArray(header) ? header[0] : header) || '';
}

function shouldSkip(req: Request): boolean {
  const url = req.originalUrl || req.url;
  if (SKIP_PATH_FRAGMENTS.some((fragment) => url.includes(fragment))) return true;
  const ua = requestUserAgent(req).toLowerCase();
  return SKIP_USER_AGENT_FRAGMENTS.some((fragment) => ua.includes(fragment));
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

  if (shouldSkip(req)) {
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
