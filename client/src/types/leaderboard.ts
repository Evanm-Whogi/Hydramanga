export interface LeaderboardKarma {
  totalKarma: number;
  level: number;
  levelName: string;
}

export interface LeaderboardSummary {
  totalComments: number;
  totalMembers: number;
  commentsThisMonth: number;
}

export type LeaderboardTab = 'overall' | 'chapters' | 'streaks' | 'comments' | 'reviews';
export type LeaderboardPeriod = 'all' | 'month' | 'week' | 'day';

export interface LeaderboardPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface LeaderboardUserRow {
  rank: number;
  id: string;
  name: string;
  username: string | null;
  displayUsername: string | null;
  image: string | null;
  role: string;
  karma: LeaderboardKarma;
  chapters: number;
  comments: number;
  streak: number;
  reviews: number;
  xp: number;
  periodXp?: number;
  tabTotal: number;
}

export interface LeaderboardResponse {
  podium: LeaderboardUserRow[];
  rows: LeaderboardUserRow[];
  pagination: LeaderboardPagination;
}
