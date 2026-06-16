export type PeriodKey = 'all' | 'today' | 'week' | 'month' | 'day';

export function getThreshold(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case 'today':
    case 'day':
      return new Date(now.setHours(0, 0, 0, 0));
    case 'week':
      return new Date(now.setDate(now.getDate() - 7));
    case 'month':
      return new Date(now.setMonth(now.getMonth() - 1));
    default:
      return null;
  }
}
