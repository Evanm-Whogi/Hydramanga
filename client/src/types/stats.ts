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

export interface UserStats {
  totalSeriesReading: number;
  averageCompletion: number;
  totalPagesRead: number;
  readingTimes: MangaReadingTime[];
}

export interface UserStatsResponse {
  status: number;
  stats: UserStats;
}
