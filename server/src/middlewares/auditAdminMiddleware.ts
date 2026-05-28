import { Request, Response, NextFunction } from 'express';
import { resolveAdminAuditAction } from '@/audit/adminActionMap';
import {adminMutationHref, buildAdminMutationSummary, captureAdminRequestBody} from '@/audit/metadataHelpers';
import { recordAuditFromRequest } from '@/audit/record';

/**
 * Logs admin mutations (not page views / GET) after the response completes.
 */
export function auditAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (res.locals.auditLoggedExplicitly) return;

    const path = req.originalUrl?.split('?')[0] ?? req.path;
    if (!path.startsWith('/admin')) return;

    const params = req.params as Record<string, string>;
    const resolved = resolveAdminAuditAction(req.method, path, params);
    if (!resolved) return;

    const requestBody = captureAdminRequestBody(req.body);
    const href = adminMutationHref(resolved.action, params);
    const summary = buildAdminMutationSummary(resolved.action, params, requestBody);

    recordAuditFromRequest(req, {
      action: resolved.action,
      category: resolved.category,
      resourceType: resolved.resourceType ?? null,
      resourceId: resolved.resourceId ?? null,
      targetUserId: resolved.targetUserId ?? null,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      skipDedup: true,
      metadata: {
        href,
        summary,
        ...(requestBody ? { changes: requestBody } : {}),
      },
    });
  });

  next();
}
