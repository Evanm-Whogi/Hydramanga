import { Request, Response, NextFunction } from 'express';
import logger from '@/services/loggerService';
import { emailService } from '@/services/emailService';

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getContactRecipient = (): string => {
  return process.env.CONTACT_EMAIL || process.env.SMTP_USER || '';
};

const getLegalRecipient = (): string => {
  return process.env.LEGAL_EMAIL || process.env.SMTP_USER || '';
};

const getRequestMeta = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.ip;
  const userAgent = req.get('user-agent') || 'unknown';
  return { ip, userAgent };
};

export async function submitContact(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !subject || !message) return res.status(400).json({ message: 'All fields are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Please provide a valid email address.' });
    if (String(message).length > 5000)  return res.status(400).json({ message: 'Message is too long.' });
    
    const recipient = getContactRecipient();
    if (!recipient) {
      logger.error('CONTACT_EMAIL is not configured', { service: 'contactController' });
      return res.status(500).json({ message: 'Contact email is not configured.' });
    }

    const { ip, userAgent } = getRequestMeta(req);

    await emailService.sendEmail(recipient, 'contactRequest', `Contact: ${subject}`, {
      name,
      email,
      subject,
      message,
      ip,
      userAgent,
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to submit contact form: ${error}`, { service: 'contactController' });
    return next(error);
  }
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  missing_chapter: 'Missing Chapter',
  mismatched_title: 'Mismatched Title',
};

export async function submitMangaReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { seriesId, mangaTitle, reportType, details } = req.body || {};
    const mangaId = Number(seriesId);

    if (!seriesId || isNaN(mangaId) || mangaId <= 0) return res.status(400).json({ message: 'Valid series ID is required.' });
    if (!reportType || !['missing_chapter', 'mismatched_title'].includes(reportType)) {
      return res.status(400).json({ message: 'Report type must be "missing_chapter" or "mismatched_title".' });
    }
    if (String(details || '').length > 2000) return res.status(400).json({ message: 'Details are too long.' });

    const recipient = getContactRecipient();
    if (!recipient) {
      logger.error('CONTACT_EMAIL is not configured', { service: 'contactController' });
      return res.status(500).json({ message: 'Contact email is not configured.' });
    }

    const { ip, userAgent } = getRequestMeta(req);
    const reportTypeLabel = REPORT_TYPE_LABELS[reportType] || reportType;

    let reporterName = '';
    let reporterEmail = '';
    if (req.user && typeof req.user === 'object' && 'name' in req.user && 'email' in req.user) {
      reporterName = String((req.user as any).name || '');
      reporterEmail = String((req.user as any).email || '');
    }

    await emailService.sendEmail(recipient, 'mangaReport', `Manga Report: ${reportTypeLabel} - ${mangaTitle || seriesId}`, {
      seriesId: mangaId,
      mangaTitle: mangaTitle || `Series #${mangaId}`,
      reportType,
      reportTypeLabel,
      details: details || '',
      reporterName: reporterName || undefined,
      reporterEmail: reporterEmail || undefined,
      ip,
      userAgent,
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to submit manga report: ${error}`, { service: 'contactController' });
    return next(error);
  }
}

export async function submitDmca(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, description, references } = req.body || {};

    if (!name || !email || !description || !references) return res.status(400).json({ message: 'All fields are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ message: 'Please provide a valid email address.' });
    if (String(description).length > 8000 || String(references).length > 4000) return res.status(400).json({ message: 'DMCA submission is too long.' });
    
    const recipient = getLegalRecipient();
    if (!recipient) {
      logger.error('LEGAL_EMAIL is not configured', { service: 'contactController' });
      return res.status(500).json({ message: 'Legal email is not configured.' });
    }

    const { ip, userAgent } = getRequestMeta(req);

    await emailService.sendEmail(recipient, 'dmcaRequest', `DMCA Notice from ${name}`, {
      name,
      email,
      description,
      references,
      ip,
      userAgent,
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to submit DMCA form: ${error}`, { service: 'contactController' });
    return next(error);
  }
}
