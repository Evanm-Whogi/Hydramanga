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

export interface LeaderboardUserRow {
  rank: number;
  id: string;
  name: string;
  image: string | null;
  role: string;
  karma: LeaderboardKarma;
  commentCount?: number;
  seriesRead?: number;
  longestStreak?: number;
}
