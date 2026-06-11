import { apiGet } from '@/lib/api';

export type AdminDockerLogTail = number | 'all';

export interface AdminDockerContainerRow {
  id: string;
  name: string;
  service: string;
  state: string;
  status: string;
  startedAt: string | null;
}

export interface AdminLogContainersResponse {
  available: boolean;
  containers: AdminDockerContainerRow[];
  message?: string;
}

export interface AdminContainerLogsResponse {
  available: boolean;
  lines?: string;
  containerId?: string;
  tail?: AdminDockerLogTail;
  message?: string;
}

export async function getAdminLogContainers(): Promise<AdminLogContainersResponse> {
  const data = await apiGet('/admin/logs/containers', { timeoutMs: 15000 });
  return {
    available: Boolean(data.available),
    containers: Array.isArray(data.containers) ? data.containers : [],
    message: typeof data.message === 'string' ? data.message : undefined,
  };
}

export async function getAdminContainerLogs(containerId: string, options?: { tail?: AdminDockerLogTail }): Promise<AdminContainerLogsResponse> {
  const params = new URLSearchParams();
  if (options?.tail != null) params.set('tail', String(options.tail));
  const query = params.toString();
  const path = query ? `/admin/logs/containers/${encodeURIComponent(containerId)}?${query}` : `/admin/logs/containers/${encodeURIComponent(containerId)}`;
  const timeoutMs = options?.tail === 'all' ? 60000 : 15000;
  const data = await apiGet(path, { timeoutMs });
  return {
    available: data.available !== false,
    lines: typeof data.lines === 'string' ? data.lines : undefined,
    containerId: typeof data.containerId === 'string' ? data.containerId : containerId,
    tail: data.tail === 'all' ? 'all' : typeof data.tail === 'number' ? data.tail : options?.tail,
    message: typeof data.message === 'string' ? data.message : undefined,
  };
}
