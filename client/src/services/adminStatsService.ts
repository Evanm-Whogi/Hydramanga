import { apiGet } from '@/lib/api';

export interface AdminOverviewStats {
  users: {
    total: number;
    admins: number;
    newLast7Days: number;
    newLast30Days: number;
  };
  manga: {
    totalSeries: number;
    seriesWithChapters: number;
    activeImports: number;
    failedImports: number;
  };
  views: {
    totalViews: number;
  };
  queues: {
    waiting: number;
    active: number;
    failed: number;
    delayed: number;
  };
}

export interface TimeseriesPoint {
  date: string;
  count: number;
}

export interface AdminTimeseries {
  days: number;
  userSignups: TimeseriesPoint[];
  mangaViews: TimeseriesPoint[];
  importCompletions: TimeseriesPoint[];
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const data = await apiGet('/admin/stats/overview', { timeoutMs: 20000 });
  const stats = (data as { stats?: AdminOverviewStats }).stats;
  if (!stats) throw new Error('Invalid overview stats response');
  return stats;
}

export async function getAdminTimeseries(days = 30): Promise<AdminTimeseries> {
  const data = await apiGet(`/admin/stats/timeseries?days=${days}`, { timeoutMs: 20000 });
  const timeseries = (data as { timeseries?: AdminTimeseries }).timeseries;
  if (!timeseries) throw new Error('Invalid timeseries response');
  return timeseries;
}
