import { Request, Response, NextFunction } from 'express';
import { auditLogService } from '@/services/auditLogService';
import type { AuditCategory, ListAdminAuditParams } from '@/audit/types';

const VALID_CATEGORIES: AuditCategory[] = [
  'auth',
  'admin',
  'manga',
  'library',
  'social',
  'community',
  'settings',
  'moderation',
  'system',
];

export async function listAdminAuditLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const category = req.query.category as string | undefined;
    const params: ListAdminAuditParams = {
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      actorId: typeof req.query.actorId === 'string' ? req.query.actorId : undefined,
      actorName: typeof req.query.actorName === 'string' ? req.query.actorName : undefined,
      impersonatorId: typeof req.query.impersonatorId === 'string' ? req.query.impersonatorId : undefined,
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      category: category && VALID_CATEGORIES.includes(category as AuditCategory) ? (category as AuditCategory) : undefined,
      resourceType: typeof req.query.resourceType === 'string' ? req.query.resourceType : undefined,
      resourceId: typeof req.query.resourceId === 'string' ? req.query.resourceId : undefined,
      targetUserId: typeof req.query.targetUserId === 'string' ? req.query.targetUserId : undefined,
      success: req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    };

    const result = await auditLogService.listForAdmin(params);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
