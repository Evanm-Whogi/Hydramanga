import { apiPost } from '@/lib/api';

export type ContactPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type DmcaPayload = {
  name: string;
  email: string;
  description: string;
  references: string;
};

export async function sendContactMessage(payload: ContactPayload): Promise<void> {
  const result = await apiPost('/contact', payload);
  if (!result.success) throw new Error(result?.message || 'Failed to send message');
  
}

export async function sendDmcaNotice(payload: DmcaPayload): Promise<void> {
  const result = await apiPost('/dmca', payload);
  if (!result.success) throw new Error(result?.message || 'Failed to submit DMCA notice');
}

export type MangaReportPayload = {seriesId: number; mangaTitle: string; reportType: 'missing_chapter' | 'mismatched_title'; details?: string};
export async function sendMangaReport(payload: MangaReportPayload): Promise<void> {
  const result = await apiPost('/manga-report', payload);
  if (!result.success) throw new Error(result?.message || 'Failed to submit report');
}
