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
      normalized === '/admin/manga/catalog-scan' ||
      normalized.match(/^\/admin\/manga\/[^/]+\/scraper-search$/) ||
      normalized.match(/^\/admin\/manga\/[^/]+\/source$/) ||
      normalized === '/admin/import-requests' ||
      normalized === '/admin/queues' ||
      normalized.match(/^\/admin\/queues\/[^/]+\/jobs$/) ||
      normalized === '/admin/archive/jobs' ||
      normalized === '/admin/scrapers/egress-status' ||
      normalized.match(/^\/admin\/manga\/[^/]+\/archive-status$/) ||
      normalized === '/admin/placeholders' ||
      normalized === '/admin/audit' ||
      normalized === '/admin/settings'
    ) {
      return null;
    }
  }

  if (normalized === '/admin/placeholders/dismiss') {
    return { action: 'admin.placeholders.dismiss', category: 'admin', resourceType: 'placeholder' };
  }
  if (normalized === '/admin/placeholders/download-from') {
    return { action: 'admin.placeholders.download_from', category: 'admin', resourceType: 'placeholder' };
  }
  if (normalized === '/admin/placeholders/redownload') {
    return { action: 'admin.placeholders.redownload', category: 'admin', resourceType: 'placeholder' };
  }
  if (normalized === '/admin/placeholders/replace') {
    return { action: 'admin.placeholders.replace', category: 'admin', resourceType: 'placeholder' };
  }

  if (normalized === '/admin/settings' && method === 'PATCH') {
    return {
      action: 'admin.settings.update',
      category: 'admin',
      resourceType: 'site_settings',
      resourceId: '1',
    };
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
  if (normalized === '/admin/manga/scan-ranked') {
    return { action: 'admin.manga.scan_ranked', category: 'admin', resourceType: 'system' };
  }
  if (normalized === '/admin/manga/catalog-scan/start') {
    return { action: 'admin.manga.catalog_scan.start', category: 'admin', resourceType: 'system' };
  }
  if (normalized === '/admin/manga/catalog-scan/stop') {
    return { action: 'admin.manga.catalog_scan.stop', category: 'admin', resourceType: 'system' };
  }
  if (normalized === '/admin/manga/catalog-scan/force-stop') {
    return { action: 'admin.manga.catalog_scan.force_stop', category: 'admin', resourceType: 'system' };
  }
  if (normalized === '/admin/manga/catalog-scan/reset') {
    return { action: 'admin.manga.catalog_scan.reset', category: 'admin', resourceType: 'system' };
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

  // Archive (torrent) acquisition management
  if (normalized === '/admin/archive/orphans/purge') {
    return { action: 'admin.archive.orphans.purge', category: 'admin', resourceType: 'system' };
  }
  const archiveJobAction = normalized.match(/^\/admin\/archive\/jobs\/[^/]+\/(retry|dismiss|abandon-torrent|import-volume)$/);
  if (archiveJobAction) {
    return {
      action: `admin.archive.job.${archiveJobAction[1].replace(/-/g, '_')}`,
      category: 'admin',
      resourceType: 'acquisition_job',
      resourceId: params.jobId,
    };
  }
  if (normalized.match(/^\/admin\/archive\/jobs\/[^/]+$/) && method === 'DELETE') {
    return {
      action: 'admin.archive.job.delete',
      category: 'admin',
      resourceType: 'acquisition_job',
      resourceId: params.jobId,
    };
  }
  if (normalized === '/admin/scrapers/rotate-egress') {
    return { action: 'admin.scrapers.rotate_egress', category: 'admin', resourceType: 'system' };
  }
  if (normalized.match(/^\/admin\/manga\/[^/]+\/archive-import$/) || normalized.match(/^\/admin\/manga\/[^/]+\/archive-reingest$/)) {
    return {
      action: normalized.endsWith('archive-import') ? 'admin.archive.import' : 'admin.archive.reingest',
      category: 'admin',
      resourceType: 'series',
      resourceId: params.id,
    };
  }

  return {
    action: `admin.request.${method.toLowerCase()}`,
    category: 'admin',
    resourceType: 'http',
    resourceId: normalized,
  };
}
