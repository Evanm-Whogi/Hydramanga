import { apiGet } from '@/lib/api';
import type { LeaderboardSummary, LeaderboardUserRow } from '@/types/leaderboard';

export async function getLeaderboardSummary(): Promise<LeaderboardSummary> {
  return apiGet('/leaderboard/summary');
}

export async function getLeaderboardCommenters(): Promise<{ rows: LeaderboardUserRow[] }> {
  return apiGet('/leaderboard/commenters?limit=50');
}

export async function getLeaderboardReaders(): Promise<{ rows: LeaderboardUserRow[] }> {
  return apiGet('/leaderboard/readers?limit=50');
}

export async function getLeaderboardStreaks(): Promise<{ rows: LeaderboardUserRow[] }> {
  return apiGet('/leaderboard/streaks?limit=50');
}
