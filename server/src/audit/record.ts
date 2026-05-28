import { Request } from 'express';
import { auditLogService } from '@/services/auditLogService';
import type { AuditEventInput } from '@/audit/types';
import { buildAuditBaseFromRequest } from '@/audit/fromRequest';

export function recordAudit(event: AuditEventInput): void {
  void auditLogService.record(event);
}

export function recordAuditFromRequest(req: Request, event: Partial<AuditEventInput> & Pick<AuditEventInput, 'action' | 'category'>): void {
  void auditLogService.recordFromRequest(req, event);
}

export function recordAuditAfterResponse(req: Request, res: { statusCode: number }, event: Partial<AuditEventInput> & Pick<AuditEventInput, 'action' | 'category'>): void {
  void auditLogService.recordFromRequest(req, {
    ...event,
    statusCode: res.statusCode,
    success: res.statusCode < 400,
  });
}
