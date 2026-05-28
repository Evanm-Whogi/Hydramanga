const AUTH_SUMMARIES: Record<string, string> = {
  'auth.register': 'Account created',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.password_reset_request': 'Password reset requested',
  'auth.password_reset_complete': 'Password reset completed',
  'auth.password_change': 'Password changed',
  'auth.email_verify': 'Email verified',
  'auth.email_change': 'Email address changed',
  'auth.oauth_link': 'Social account linked',
  'auth.oauth_unlink': 'Social account unlinked',
  'auth.session_revoke': 'Session revoked',
  'auth.impersonation_start': 'Admin impersonation started',
  'auth.impersonation_end': 'Admin impersonation ended',
};

const ACTION_LABELS: Record<string, string> = {
  'comment.create': 'Posted a comment',
  'comment.update': 'Edited a comment',
  'comment.delete': 'Deleted a comment',
  'comment.delete.admin': 'Admin deleted a comment',
  'comment.vote': 'Voted on a comment',
  'review.create': 'Posted a review',
  'review.update': 'Edited a review',
  'review.delete': 'Deleted a review',
  'review.delete.admin': 'Admin deleted a review',
  'board.post.create': 'Created a board post',
  'board.post.update': 'Edited a board post',
  'board.post.delete': 'Deleted a board post',
  'board.reply.create': 'Replied on the board',
  'board.reply.update': 'Edited a board reply',
  'board.reply.delete': 'Deleted a board reply',
  'chat.message.create': 'Sent a chat message',
  'chat.message.update': 'Edited a chat message',
  'chat.message.delete': 'Deleted a chat message',
  'announcement.create': 'Published an announcement',
  'import_request.create': 'Submitted an import request',
  'manga.report': 'Reported a manga issue',
  'manga.view': 'Viewed manga',
  'chapter.view': 'Viewed chapter',
  'contact.submit': 'Submitted contact form',
  'dmca.submit': 'Submitted DMCA notice',
};

export function summarizeAuditAction(action: string, metadata?: Record<string, unknown> | null): string {
  if (metadata && typeof metadata.summary === 'string' && metadata.summary.trim()) return metadata.summary.trim();
  if (AUTH_SUMMARIES[action]) return AUTH_SUMMARIES[action];

  const provider = metadata?.provider;
  if (action === 'auth.login' && typeof provider === 'string') return `Signed in via ${provider}`;
  if (action === 'auth.login_failed' && typeof metadata?.identifier === 'string') return `Failed sign-in for ${metadata.identifier}`;
  
  if (ACTION_LABELS[action]) {
    const base = ACTION_LABELS[action];
    if (typeof metadata?.seriesTitle === 'string') return `${base} on ${metadata.seriesTitle}`;
    if (typeof metadata?.title === 'string') return `${base}: ${metadata.title}`;
    
    return base;
  }

  if (action.startsWith('admin.')) return action.replace(/^admin\./, 'Admin: ').replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  
  return action.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
