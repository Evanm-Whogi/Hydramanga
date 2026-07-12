import {Request, Response, NextFunction, RequestHandler} from 'express';
import client from 'prom-client';

const SKIP_PATH_FRAGMENTS = ['/heartbeat', '/socket.io', '/metrics'];

let metricsInitialized = false;

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'status_code', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'status_code', 'route'] as const,
});

function shouldSkip(url: string): boolean {
  return SKIP_PATH_FRAGMENTS.some((fragment) => url.includes(fragment));
}

function normalizeRoute(req: Request): string {
  const routePath = (req as any).route?.path;
  if (typeof routePath === 'string' && req.baseUrl !== undefined) {
    return `${req.baseUrl}${routePath}` || req.path || 'unknown';
  }
  // Fall back to path without dynamic id explosion where possible
  return req.path || req.originalUrl?.split('?')[0] || 'unknown';
}

export function initPrometheusMetrics(): void {
  if (metricsInitialized) return;
  client.collectDefaultMetrics({register: client.register});
  metricsInitialized = true;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (shouldSkip(req.originalUrl || req.url)) {
    next();
    return;
  }

  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const labels = {
      method: req.method,
      status_code: String(res.statusCode),
      route: normalizeRoute(req),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });

  next();
}

export const metricsHandler: RequestHandler = async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
};
