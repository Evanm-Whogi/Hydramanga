export interface ResolvedAdminAuditAction {
  action: string;
  category: 'admin' | 'moderation';
  resourceType?: string;
  resourceId?: string;
  targetUserId?: string;
}

export function resolveAdminAuditAction(method: string, path: string, params: Record<string, string>): ResolvedAdminAuditAction | null {
  const normalized = path.replace(/\?.*$/, '');

  if (normalized.endsWith('/heartbeat')) return null;
  if (method === 'HEAD' || method === 'OPTIONS') return null;

  // Admin UI reads / list endpoints — not audited
  if (method === 'GET') {
    if (
      normalized === '/admin/stats/overview' ||
      normalized === '/admin/stats/timeseries' ||
      normalized === '/admin/users' ||
      normalized.match(/^\/admin\/users\/[^/]+$/) ||
      normalized === '/admin/manga' ||
      normalized === '/admin/manga/scraper-filters' ||
      normalized.match(/^\/admin\/manga\/[^/]+\/scraper-search$/) ||
      normalized.match(/^\/admin\/manga\/[^/]+\/source$/) ||
      normalized === '/admin/import-requests' ||
      normalized === '/admin/queues' ||
      normalized.match(/^\/admin\/queues\/[^/]+\/jobs$/) ||
      normalized === '/admin/audit'
    ) {
      return null;
    }
  }

  if (normalized.match(/^\/admin\/import-requests\/[^/]+$/) && method === 'PATCH') {
    return null;
  }

  if (normalized.match(/^\/admin\/users\/[^/]+$/) && method === 'PATCH') {
    return {
      action: 'admin.user.update',
      category: 'admin',
      resourceType: 'user',
      resourceId: params.id,
      targetUserId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/users\/[^/]+\/send-verification$/)) {
    return {
      action: 'admin.user.send_verification',
      category: 'admin',
      resourceType: 'user',
      resourceId: params.id,
      targetUserId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/users\/[^/]+\/send-password-reset$/)) {
    return {
      action: 'admin.user.send_password_reset',
      category: 'admin',
      resourceType: 'user',
      resourceId: params.id,
      targetUserId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/users\/[^/]+\/ban$/)) {
    return {
      action: 'admin.user.ban',
      category: 'moderation',
      resourceType: 'user',
      resourceId: params.id,
      targetUserId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/users\/[^/]+\/unban$/)) {
    return {
      action: 'admin.user.unban',
      category: 'moderation',
      resourceType: 'user',
      resourceId: params.id,
      targetUserId: params.id,
    };
  }

  if (normalized === '/admin/manga/sync') {
    return { action: 'admin.manga.sync', category: 'admin', resourceType: 'system' };
  }
  if (normalized === '/admin/manga/rescan-monitored') {
    return { action: 'admin.manga.rescan_monitored', category: 'admin', resourceType: 'system' };
  }
  if (normalized === '/admin/manga/rescan-trending') {
    return { action: 'admin.manga.rescan_trending', category: 'admin', resourceType: 'system' };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/source$/) && method === 'DELETE') {
    return {
      action: 'admin.manga.source.clear',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/source$/) && method === 'PATCH') {
    return {
      action: 'admin.manga.source.set',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+$/) && method === 'PATCH') {
    return {
      action: 'admin.manga.update',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/secondary-titles$/)) {
    return {
      action: 'admin.manga.secondary_title.add',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/rescan$/)) {
    return {
      action: 'admin.manga.rescan',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/cancel-scan$/)) {
    return {
      action: 'admin.manga.scan.cancel',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/chapters$/) && method === 'DELETE') {
    return {
      action: 'admin.manga.chapters.delete',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }

  if (normalized.match(/^\/admin\/queues\/[^/]+\/pause$/)) {
    return {
      action: 'admin.queue.pause',
      category: 'admin',
      resourceType: 'queue',
      resourceId: params.name,
    };
  }
  if (normalized.match(/^\/admin\/queues\/[^/]+\/resume$/)) {
    return {
      action: 'admin.queue.resume',
      category: 'admin',
      resourceType: 'queue',
      resourceId: params.name,
    };
  }
  if (normalized.match(/^\/admin\/queues\/[^/]+\/jobs\/[^/]+\/retry$/)) {
    return {
      action: 'admin.queue.job.retry',
      category: 'admin',
      resourceType: 'queue_job',
      resourceId: params.jobId,
    };
  }
  if (normalized.match(/^\/admin\/queues\/[^/]+\/jobs\/[^/]+\/promote$/)) {
    return {
      action: 'admin.queue.job.promote',
      category: 'admin',
      resourceType: 'queue_job',
      resourceId: params.jobId,
    };
  }
  if (normalized.match(/^\/admin\/queues\/[^/]+\/jobs\/[^/]+$/) && method === 'DELETE') {
    return {
      action: 'admin.queue.job.delete',
      category: 'admin',
      resourceType: 'queue_job',
      resourceId: params.jobId,
    };
  }

  return {
    action: `admin.request.${method.toLowerCase()}`,
    category: 'admin',
    resourceType: 'http',
    resourceId: normalized,
  };
}
