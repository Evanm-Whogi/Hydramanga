import { apiDelete, apiGet, apiPost } from '@/lib/api';

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

export interface AdminQueuesResponse {
  queues: AdminQueueRow[];
  totals: AdminQueueTotals;
  redisAvailable: boolean;
}

export async function getAdminQueues(): Promise<AdminQueuesResponse> {
  const data = await apiGet('/admin/queues', { timeoutMs: 15000 });
  return {
    queues: (data as { queues: AdminQueueRow[] }).queues ?? [],
    totals: (data as { totals: AdminQueueTotals }).totals,
    redisAvailable: (data as { redisAvailable: boolean }).redisAvailable ?? true,
  };
}

export type AdminQueueJobState = 'waiting' | 'active' | 'delayed' | 'failed' | 'completed';

export interface AdminQueueJobCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

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

export interface AdminQueueJobsResponse {
  queue: { name: string; label: string; description: string };
  state: AdminQueueJobState;
  counts: AdminQueueJobCounts;
  jobs: AdminQueueJobRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function getAdminQueueJobs(queueName: string, params: { state?: AdminQueueJobState; page?: number; limit?: number } = {}): Promise<AdminQueueJobsResponse> {
  const query = new URLSearchParams();
  if (params.state) query.set('state', params.state);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const data = await apiGet(`/admin/queues/${encodeURIComponent(queueName)}/jobs${qs ? `?${qs}` : ''}`, {
    timeoutMs: 15000,
  });
  return {
    queue: (data as { queue: AdminQueueJobsResponse['queue'] }).queue,
    state: (data as { state: AdminQueueJobState }).state,
    counts: (data as { counts: AdminQueueJobCounts }).counts,
    jobs: (data as { jobs: AdminQueueJobRow[] }).jobs ?? [],
    pagination: (data as { pagination: AdminQueueJobsResponse['pagination'] }).pagination,
  };
}

export async function retryAdminQueueJob(queueName: string, jobId: string): Promise<void> {
  await apiPost(`/admin/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/retry`);
}

export async function promoteAdminQueueJob(queueName: string, jobId: string): Promise<void> {
  await apiPost(`/admin/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/promote`);
}

export async function removeAdminQueueJob(queueName: string, jobId: string, opts?: { force?: boolean }): Promise<void> {
  const qs = opts?.force ? '?force=true' : '';
  await apiDelete(`/admin/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}${qs}`);
}

export async function pauseAdminQueue(queueName: string): Promise<void> {
  await apiPost(`/admin/queues/${encodeURIComponent(queueName)}/pause`);
}

export async function resumeAdminQueue(queueName: string): Promise<void> {
  await apiPost(`/admin/queues/${encodeURIComponent(queueName)}/resume`);
}

export async function clearAdminQueue(queueName: string, state?: AdminQueueJobState): Promise<{ removed: number }> {
  const data = await apiPost(`/admin/queues/${encodeURIComponent(queueName)}/clear`, state ? { state } : undefined);
  return { removed: (data as { removed?: number }).removed ?? 0 };
}
