import { Request, Response, NextFunction } from 'express';
import { auditLogService } from '@/services/auditLogService';

export async function listMyAuthAuditLogs(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await auditLogService.listAuthForUser(userId, {
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
