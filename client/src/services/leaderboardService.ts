import { apiGet } from '@/lib/api';
import type { LeaderboardPeriod, LeaderboardResponse, LeaderboardSummary, LeaderboardTab } from '@/types/leaderboard';

export const LEADERBOARD_PAGE_SIZE = 50;

export async function getLeaderboardSummary(): Promise<LeaderboardSummary> {
  return apiGet('/leaderboard/summary');
}

export async function getLeaderboard(params: { tab: LeaderboardTab; period?: LeaderboardPeriod; page?: number; limit?: number }): Promise<LeaderboardResponse> {
  const search = new URLSearchParams({
    tab: params.tab,
    period: params.period ?? 'all',
    page: String(params.page ?? 1),
    limit: String(params.limit ?? LEADERBOARD_PAGE_SIZE),
  });
  return apiGet(`/leaderboard?${search.toString()}`);
}
