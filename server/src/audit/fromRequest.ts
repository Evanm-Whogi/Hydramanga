import { Request } from 'express';
import type { AuditActorRole, AuditEventInput } from '@/audit/types';
import { isAdminRole } from '@/lib/authHelpers';

export interface TrackingData {
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
}

export function getTrackingData(req: Request): TrackingData {
  return (req as Request & { trackingData?: TrackingData }).trackingData ?? {};
}

export function resolveActorFromRequest(req: Request): Pick<AuditEventInput, 'actorId' | 'impersonatorId' | 'actorRole' | 'ipAddress' | 'userAgent'> {
  const tracking = getTrackingData(req);
  const user = req.user as { id?: string; role?: string } | undefined;
  const session = req.session as { impersonatedBy?: string | null } | undefined;

  if (user?.id) {
    return {
      actorId: user.id,
      impersonatorId: session?.impersonatedBy ?? null,
      actorRole: isAdminRole(user.role) ? 'admin' : 'user',
      ipAddress: tracking.ipAddress ?? null,
      userAgent: tracking.userAgent ?? null,
    };
  }

  return {
    actorId: null,
    impersonatorId: null,
    actorRole: 'anonymous',
    ipAddress: tracking.ipAddress ?? null,
    userAgent: tracking.userAgent ?? null,
  };
}

export function buildAuditBaseFromRequest(req: Request): Pick<AuditEventInput, | 'actorId' | 'impersonatorId' | 'actorRole' | 'ipAddress' | 'userAgent' | 'method' | 'path'> {
  const actor = resolveActorFromRequest(req);
  return {
    ...actor,
    method: req.method,
    path: req.originalUrl?.split('?')[0] ?? req.path,
  };
}

export function actorRoleLabel(role: AuditActorRole): string {
  switch (role) {
    case 'anonymous':
      return 'Anonymous';
    case 'admin':
      return 'Admin';
    case 'system':
      return 'System';
    default:
      return 'User';
  }
}
