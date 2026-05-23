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

export interface UserKarma {
  totalKarma: number;
  level: number;
  levelName: string;
  currentLevelKarma: number;
  karmaForNextLevel: number;
  karmaToNextLevel: number;
  progressToNextLevel: number;
  breakdown?: Record<string, number>;
}

/** @deprecated Use UserKarma */
export type UserXp = UserKarma & {
  totalXp?: number;
  currentLevelXp?: number;
  xpForNextLevel?: number;
  xpToNextLevel?: number;
};

export interface UserStats {
  totalSeriesReading: number;
  averageCompletion: number;
  totalPagesRead: number;
  readingTimes: MangaReadingTime[];
  seriesSaved: number;
  streak: number;
  currentStreak?: number;
  karma: UserKarma;
  /** @deprecated Use karma */
  xp?: UserKarma;
}

export interface UserStatsResponse {
  status: number;
  stats: UserStats;
}
