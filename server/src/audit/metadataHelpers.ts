const DEFAULT_CONTENT_MAX = 2000;
const DEFAULT_TITLE_MAX = 300;

export function truncateForAudit(text: string | null | undefined, max = DEFAULT_CONTENT_MAX): string | undefined {
  if (text == null) return undefined;
  const t = String(text).trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function mangaPageHref(seriesId: number | string): string {
  return `/manga/${seriesId}`;
}

export function boardPostHref(postId: number | string): string {
  return `/forum/${postId}`;
}

export function chatPageHref(): string {
  return '/chat';
}

export function adminImportsHref(): string {
  return '/admin/imports';
}

export function adminUsersHref(): string {
  return '/admin/users';
}

export function contentAuditMeta(opts: {href: string; summary: string; content?: string | null; title?: string | null; extra?: Record<string, unknown>}): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    href: opts.href,
    summary: opts.summary,
    ...opts.extra,
  };
  const content = truncateForAudit(opts.content);
  const title = truncateForAudit(opts.title, DEFAULT_TITLE_MAX);
  if (content) meta.content = content;
  if (title) meta.title = title;
  return meta;
}

const BODY_SKIP_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'cookie',
  'authorization',
]);

export function captureAdminRequestBody(body: unknown, maxFieldLen = 2000): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (BODY_SKIP_KEYS.has(key.toLowerCase())) continue;
    if (value == null) continue;
    if (typeof value === 'string') {
      out[key] = truncateForAudit(value, maxFieldLen);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20);
    } else if (typeof value === 'object') {
      out[key] = captureAdminRequestBody(value, 500);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildAdminMutationSummary(action: string, params: Record<string, string>, body?: Record<string, unknown> | null): string {
  const b = body ?? {};

  switch (action) {
    case 'admin.import_request.update': {
      const parts = [`Updated import request #${params.id}`];
      if (typeof b.status === 'string') parts.push(`status → ${b.status}`);
      if (typeof b.adminNotes === 'string' && b.adminNotes) {
        parts.push(`notes: "${b.adminNotes}"`);
      }
      if (b.seriesId != null) parts.push(`linked series ${b.seriesId}`);
      return parts.join(' · ');
    }
    case 'admin.user.update':
      return `Updated user ${params.id}${b.role ? ` (role: ${b.role})` : ''}`;
    case 'admin.user.ban': {
      const reason = typeof b.banReason === 'string' ? b.banReason : '';
      return `Banned user ${params.id}${reason ? `: ${reason}` : ''}`;
    }
    case 'admin.user.unban':
      return `Unbanned user ${params.id}`;
    case 'admin.user.send_verification':
      return `Sent verification email to user ${params.id}`;
    case 'admin.user.send_password_reset':
      return `Sent password reset to user ${params.id}`;
    case 'admin.manga.update':
      return `Updated manga #${params.id}`;
    case 'admin.manga.source.set':
      return `Set manga #${params.id} source`;
    case 'admin.manga.source.clear':
      return `Cleared manga #${params.id} source`;
    case 'admin.manga.rescan':
      return `Triggered rescan for manga #${params.id}`;
    case 'admin.manga.chapters.delete':
      return `Deleted chapters for manga #${params.id}`;
    case 'admin.manga.sync':
      return 'Triggered full manga metadata sync';
    case 'admin.queue.pause':
      return `Paused queue ${params.name}`;
    case 'admin.queue.resume':
      return `Resumed queue ${params.name}`;
    case 'admin.queue.job.retry':
      return `Retried job ${params.jobId} on ${params.name}`;
    case 'admin.queue.job.delete':
      return `Removed job ${params.jobId} from ${params.name}`;
    case 'admin.settings.update':
      return 'Updated site settings';
    default:
      return action.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function adminMutationHref(action: string, params: Record<string, string>): string | undefined {
  if (action.startsWith('admin.import_request')) return adminImportsHref();
  if (action.startsWith('admin.user')) return adminUsersHref();
  if (action.startsWith('admin.manga') && params.id) return `/manga/${params.id}`;
  if (action.startsWith('admin.queue')) return '/admin/queues';
  if (action === 'admin.settings.update') return '/admin/settings';
  return '/admin';
}
