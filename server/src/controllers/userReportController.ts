import { Request, Response, NextFunction } from 'express';
import logger from '@/services/loggerService';
import { emailService } from '@/services/emailService';
import { recordAuditFromRequest } from '@/audit/record';
import { contentAuditMeta } from '@/audit/metadataHelpers';
import { resolveUserId } from '@/services/profileSectionService';

const USER_REPORT_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate Content',
  impersonation: 'Impersonation',
  other: 'Other',
};

export async function reportUser(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { username, reportType, details } = req.body || {};

    const resolved = await resolveUserId(req.params.identifier, req.user!.id);
    if (!resolved) return res.status(404).json({ message: 'User not found.' });
    if (resolved.isOwner) return res.status(400).json({ message: 'You cannot report yourself.' });

    if (!reportType || !Object.keys(USER_REPORT_LABELS).includes(reportType)) {
      return res.status(400).json({ message: 'Invalid report type.' });
    }
    if (String(details || '').length > 2000) return res.status(400).json({ message: 'Details are too long.' });

    const recipient = process.env.CONTACT_EMAIL || process.env.SMTP_USER || '';
    if (!recipient) {
      logger.error('CONTACT_EMAIL is not configured', { service: 'userReportController' });
      return res.status(500).json({ message: 'Contact email is not configured.' });
    }

    const reportTypeLabel = USER_REPORT_LABELS[reportType] || reportType;
    const profileLabel = username || resolved.userId;

    await emailService.sendEmail(recipient, 'userReport', `User Report: ${reportTypeLabel} - ${profileLabel}`, {
      userId: resolved.userId,
      username: profileLabel,
      reportType,
      reportTypeLabel,
      details: details || '',
      reporterName: req.user?.name || undefined,
      reporterEmail: req.user?.email || undefined,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
    });

    recordAuditFromRequest(req, {
      action: 'user.report',
      category: 'social',
      resourceType: 'user',
      resourceId: resolved.userId,
      skipDedup: true,
      metadata: contentAuditMeta({
        href: `/users/${encodeURIComponent(req.params.identifier)}`,
        summary: `Reported user: ${reportTypeLabel}`,
        title: profileLabel,
        content: details || undefined,
        extra: { reportType, reportTypeLabel },
      }),
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to submit user report: ${error}`, { service: 'userReportController' });
    return next(error);
  }
}
