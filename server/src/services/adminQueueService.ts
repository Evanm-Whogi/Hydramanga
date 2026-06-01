import type { JobType } from 'bullmq';
import { appConfig } from '@/config/appConfig';
import { queueService } from '@/services/queueService';
import {getAdminQueueDisplayOrder, getChapterDownloadQueueDescription, getChapterDownloadQueueLabel, isChapterDownloadJobQueue, isChapterDownloadQueue, resolveChapterDownloadQueueConfig, scraperIdFromChapterDownloadQueue} from '@/lib/chapterDownloadQueues';

const STATIC_QUEUE_NAMES = (Object.keys(appConfig.queues) as (keyof typeof appConfig.queues)[]).filter(
  (name): name is Exclude<keyof typeof appConfig.queues, 'chapterDownload'> => name !== 'chapterDownload'
);

const QUEUE_LABELS: Record<string, string> = {
  emailQueue: 'Email',
  mangaImportQueue: 'Manga Import',
  mangaChapterImportQueue: 'Chapter Scan',
};

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  emailQueue: 'Transactional and notification emails',
  mangaImportQueue: 'Full series import and metadata sync',
  mangaChapterImportQueue: 'Scraper chapter list discovery',
};

function getAllAdminQueueNames(): string[] {
  return getAdminQueueDisplayOrder();
}

function getQueueLabel(name: string): string {
  if (isChapterDownloadQueue(name)) return getChapterDownloadQueueLabel(name);
  return QUEUE_LABELS[name] ?? name;
}

function getQueueDescription(name: string): string {
  if (isChapterDownloadQueue(name)) return getChapterDownloadQueueDescription(name);
  return QUEUE_DESCRIPTIONS[name] ?? '';
}

function getQueueConcurrency(name: string): number {
  if (isChapterDownloadQueue(name)) {
    const scraperId = scraperIdFromChapterDownloadQueue(name);
    if (scraperId) return resolveChapterDownloadQueueConfig(scraperId).concurrency;
  }
  const config = appConfig.queues[name as keyof typeof appConfig.queues];
  return config && 'concurrency' in config ? config.concurrency : 1;
}

export interface AdminQueueRow {
  name: string;
  label: string;
  description: string;
  status: 'Active' | 'Paused' | 'Unavailable';
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  oldestWaitingMs: number | null;
  concurrency: number;
  error?: string;
}

export interface AdminQueueTotals {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export const ADMIN_QUEUE_JOB_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;
export type AdminQueueJobState = (typeof ADMIN_QUEUE_JOB_STATES)[number];

export interface AdminQueueJobRow {
  id: string;
  name: string;
  state: string;
  createdAt: string | null;
  processedAt: string | null;
  finishedAt: string | null;
  attemptsMade: number;
  maxAttempts: number;
  failedReason: string | null;
  progress: number | string | null;
  priority: number | null;
  summary: string;
  data: Record<string, unknown>;
}

function isValidQueueName(name: string): boolean {
  return STATIC_QUEUE_NAMES.includes(name as (typeof STATIC_QUEUE_NAMES)[number]) || isChapterDownloadJobQueue(name);
}

function summarizeJobData(jobName: string, data: unknown): string {
  if (!data || typeof data !== 'object') return jobName;
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.mangaTitle) parts.push(String(d.mangaTitle));
  if (d.seriesId != null) parts.push(`#${d.seriesId}`);
  if (d.chapterNumber != null) parts.push(`ch.${d.chapterNumber}`);
  if (d.filePath) parts.push(String(d.filePath).split('/').pop() ?? String(d.filePath));
  if (d.to) parts.push(String(d.to));
  if (d.subject) parts.push(String(d.subject));
  if (d.email) parts.push(String(d.email));
  return parts.length > 0 ? parts.join(' · ') : jobName;
}

function sanitizeJobData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  try {
    const json = JSON.stringify(data);
    if (json.length > 8000) {
      return { _truncated: true, preview: json.slice(0, 8000) };
    }
    return data as Record<string, unknown>;
  } catch {
    return { _error: 'Unable to serialize job data' };
  }
}

function resolveJobTypes(state: AdminQueueJobState): string[] {
  if (state === 'waiting') return ['waiting', 'prioritized'];
  return [state];
}

function countForState(counts: Record<string, number>, state: AdminQueueJobState): number {
  if (state === 'waiting') return (counts.waiting ?? 0) + (counts.prioritized ?? 0);
  return counts[state] ?? 0;
}

function serializeJob(job: {
  id?: string | number;
  name: string;
  data: unknown;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade?: number;
  opts?: { attempts?: number; priority?: number };
  failedReason?: string;
  progress?: unknown;
  getState?: () => Promise<string>;
}): Omit<AdminQueueJobRow, 'state'> & { state?: string } {
  let progress: number | string | null = null;
  if (typeof job.progress === 'number') progress = job.progress;
  else if (job.progress != null) progress = JSON.stringify(job.progress);

  return {
    id: String(job.id ?? ''),
    name: job.name,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    attemptsMade: job.attemptsMade ?? 0,
    maxAttempts: job.opts?.attempts ?? 3,
    failedReason: job.failedReason ?? null,
    progress,
    priority: job.opts?.priority ?? null,
    summary: summarizeJobData(job.name, job.data),
    data: sanitizeJobData(job.data),
  };
}

class AdminQueueService {
  async listQueues(): Promise<{ queues: AdminQueueRow[]; totals: AdminQueueTotals; redisAvailable: boolean }> {
    const queues: AdminQueueRow[] = [];
    let redisAvailable = true;
    const queueNames = getAllAdminQueueNames();

    await Promise.all(
      queueNames.map(async (name) => {
        try {
          const [status, snapshot] = await Promise.race([
            Promise.all([queueService.getQueueStatus(name), queueService.getQueueSnapshot(name)]),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('queue status timeout')), 5000)
            ),
          ]);

          queues.push({
            name,
            label: getQueueLabel(name),
            description: getQueueDescription(name),
            status: status.status === 'Paused' ? 'Paused' : 'Active',
            waiting: status.waiting,
            active: status.active,
            completed: status.completed,
            failed: status.failed,
            delayed: status.delayed,
            oldestWaitingMs: snapshot.oldestWaitingMs,
            concurrency: getQueueConcurrency(name),
          });
        } catch (err) {
          redisAvailable = false;
          queues.push({
            name,
            label: getQueueLabel(name),
            description: getQueueDescription(name),
            status: 'Unavailable',
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            oldestWaitingMs: null,
            concurrency: getQueueConcurrency(name),
            error: err instanceof Error ? err.message : 'Failed to read queue',
          });
        }
      })
    );

    const order = getAdminQueueDisplayOrder();
    queues.sort((a, b) => {
      const aIdx = order.indexOf(a.name);
      const bIdx = order.indexOf(b.name);
      const aOrder = aIdx >= 0 ? aIdx : order.length;
      const bOrder = bIdx >= 0 ? bIdx : order.length;
      return aOrder - bOrder || a.label.localeCompare(b.label);
    });

    const totals = queues.reduce<AdminQueueTotals>(
      (acc, q) => ({
        waiting: acc.waiting + q.waiting,
        active: acc.active + q.active,
        completed: acc.completed + q.completed,
        failed: acc.failed + q.failed,
        delayed: acc.delayed + q.delayed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    );

    return { queues, totals, redisAvailable };
  }

  async listQueueJobs(
    queueName: string,
    params: { state: AdminQueueJobState; page: number; limit: number }
  ) {
    if (!isValidQueueName(queueName)) {
      return { error: 'not_found' as const };
    }

    const { state, page, limit } = params;
    const queue = queueService.getQueue(queueName);
    const types = resolveJobTypes(state) as JobType[];
    const offset = (page - 1) * limit;
    const start = offset;
    const end = offset + limit - 1;

    try {
      const [counts, pageJobs] = await Promise.race([
        Promise.all([
          queue.getJobCounts(),
          queue.getJobs(types, start, end, false),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('queue jobs timeout')), 8000)
        ),
      ]);

      const total = countForState(counts as Record<string, number>, state);
      const stateCounts = {
        waiting: countForState(counts as Record<string, number>, 'waiting'),
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      };

      const jobs: AdminQueueJobRow[] = await Promise.all(
        pageJobs.filter(Boolean).map(async (job) => {
          const base = serializeJob(job as Parameters<typeof serializeJob>[0]);
          const jobState = typeof job.getState === 'function' ? await job.getState() : state;
          return { ...base, state: jobState };
        })
      );

      return {
        queue: {
          name: queueName,
          label: getQueueLabel(queueName),
          description: getQueueDescription(queueName),
        },
        state,
        counts: stateCounts,
        jobs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    } catch (err) {
      return {
        error: 'unavailable' as const,
        message: err instanceof Error ? err.message : 'Failed to read queue jobs',
      };
    }
  }

  async retryJob(queueName: string, jobId: string) {
    if (!isValidQueueName(queueName)) return { error: 'not_found' as const };
    try {
      await queueService.retryJob(queueName, jobId);
      return { success: true as const };
    } catch (err) {
      return {
        error: 'bad_request' as const,
        message: err instanceof Error ? err.message : 'Failed to retry job',
      };
    }
  }

  async removeJob(queueName: string, jobId: string) {
    if (!isValidQueueName(queueName)) return { error: 'not_found' as const };
    try {
      await queueService.removeJob(queueName, jobId);
      return { success: true as const };
    } catch (err) {
      return {
        error: 'bad_request' as const,
        message: err instanceof Error ? err.message : 'Failed to remove job',
      };
    }
  }

  async promoteJob(queueName: string, jobId: string) {
    if (!isValidQueueName(queueName)) return { error: 'not_found' as const };
    try {
      await queueService.promoteJob(queueName, jobId);
      return { success: true as const };
    } catch (err) {
      return {
        error: 'bad_request' as const,
        message: err instanceof Error ? err.message : 'Failed to promote job',
      };
    }
  }

  async pauseQueue(queueName: string) {
    if (!isValidQueueName(queueName)) return { error: 'not_found' as const };
    try {
      await queueService.pauseQueue(queueName);
      return { success: true as const };
    } catch (err) {
      return {
        error: 'unavailable' as const,
        message: err instanceof Error ? err.message : 'Failed to pause queue',
      };
    }
  }

  async resumeQueue(queueName: string) {
    if (!isValidQueueName(queueName)) return { error: 'not_found' as const };
    try {
      await queueService.resumeQueue(queueName);
      return { success: true as const };
    } catch (err) {
      return {
        error: 'unavailable' as const,
        message: err instanceof Error ? err.message : 'Failed to resume queue',
      };
    }
  }
}

export const adminQueueService = new AdminQueueService();
