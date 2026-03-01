export interface MangaReadingTime {
  seriesId: number;
  totalSeconds: number;
  title: string;
  image: {
    raw: {
      url: string;
    };
  };
}

export interface UserXpBreakdownItem {
  count: number;
  xp: number;
}

export interface UserXp {
  totalXp: number;
  level: number;
  levelName: string;
  currentLevelXp: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  progressToNextLevel: number;
  breakdown?: {
    comments: UserXpBreakdownItem;
    reviews: UserXpBreakdownItem;
    views: UserXpBreakdownItem;
    listAdds: UserXpBreakdownItem;
  };
}

export interface UserStats {
  totalSeriesReading: number;
  averageCompletion: number;
  totalPagesRead: number;
  readingTimes: MangaReadingTime[];
  seriesSaved: number;
  streak: number;
  xp: UserXp;
}

export interface UserStatsResponse {
  status: number;
  stats: UserStats;
}
