import { Request, Response, NextFunction, RequestHandler } from 'express';
import { auditLogService } from '@/services/auditLogService';
import { getTrackingData } from '@/audit/fromRequest';

const FAILED_LOGIN_PATHS = [
  '/auth/sign-in/email',
  '/auth/sign-in/username',
  '/auth/sign-in/social',
];

const AUTH_SUCCESS_PATHS: Record<string, { action: string; category: 'auth' }> = {
  '/auth/reset-password': { action: 'auth.password_reset_complete', category: 'auth' },
  '/auth/forget-password': { action: 'auth.password_reset_request', category: 'auth' },
  '/auth/forgot-password': { action: 'auth.password_reset_request', category: 'auth' },
  '/auth/verify-email': { action: 'auth.email_verify', category: 'auth' },
  '/auth/change-password': { action: 'auth.password_change', category: 'auth' },
};

function normalizeAuthPath(path: string): string {
  return path.split('?')[0];
}

function isFailedLoginPath(path: string): boolean {
  const normalized = normalizeAuthPath(path);
  return FAILED_LOGIN_PATHS.some((p) => normalized === p || normalized.endsWith(p));
}

function resolveAuthSuccessAction(path: string): { action: string; category: 'auth' } | null {
  const normalized = normalizeAuthPath(path);
  for (const [prefix, meta] of Object.entries(AUTH_SUCCESS_PATHS)) {
    if (normalized === prefix || normalized.endsWith(prefix)) return meta;
  }
  return null;
}

function extractLoginIdentifier(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body) return undefined;
  const email = body.email;
  const username = body.username;
  if (typeof email === 'string' && email) return email;
  if (typeof username === 'string' && username) return username;
  return undefined;
}

/**
 * Wraps better-auth handler to record failed sign-in attempts.
 */
export function auditAuthHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl?.split('?')[0] ?? req.path;

    res.on('finish', () => {
      const tracking = getTrackingData(req);
      const normalizedPath = normalizeAuthPath(path);

      if (isFailedLoginPath(normalizedPath) && res.statusCode >= 400) {
        void auditLogService.record({
          actorId: tracking.userId ?? null,
          impersonatorId: null,
          actorRole: tracking.userId ? 'user' : 'anonymous',
          action: 'auth.login_failed',
          category: 'auth',
          method: req.method,
          path: normalizedPath,
          statusCode: res.statusCode,
          success: false,
          ipAddress: tracking.ipAddress ?? null,
          userAgent: tracking.userAgent ?? null,
          skipDedup: true,
          metadata: {
            identifier: extractLoginIdentifier(req),
          },
        });
        return;
      }

      const successAction = resolveAuthSuccessAction(normalizedPath);
      if (successAction && res.statusCode < 400 && tracking.userId) {
        void auditLogService.record({
          actorId: tracking.userId,
          impersonatorId: null,
          actorRole: 'user',
          action: successAction.action,
          category: successAction.category,
          method: req.method,
          path: normalizedPath,
          statusCode: res.statusCode,
          success: true,
          ipAddress: tracking.ipAddress ?? null,
          userAgent: tracking.userAgent ?? null,
          skipDedup: true,
        });
      }
    });

    return handler(req, res, next);
  };
}
