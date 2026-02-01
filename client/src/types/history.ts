/**
 * Represents a single item in the reading or view history
 */
export interface HistoryItem {
  seriesId: number;
  seriesTitle: string;
  seriesCover: {
    raw?: { url: string };
    x350?: { x3: string };
  };
  chapterId?: number;
  chapterNumber?: string;
  chapterTitle?: string;
  pageNumber?: number;
  totalPages?: number;
  completionPercentage?: number;
  viewedAt?: string;
  readAt?: string;
  readingTimeSeconds?: number;
  rating?: number;
  totalChapters?: number;
}

export type HistoryType = 'reading' | 'viewed';
export type SortOption = 'recent' | 'oldest' | 'title' | 'progress';

/**
 * Props for the HistoryList component
 */
export interface HistoryListProps {
  items: HistoryItem[];
  type: HistoryType;
  onDelete?: (seriesId: number) => void;
}

/**
 * Props for the HistoryStats component
 */
export interface HistoryStatsProps {
  readingHistoryCount: number;
  viewHistoryCount: number;
  totalReadingTime?: number;
  mostRecentReading?: string;
}

/**
 * Props for the HistoryPageClient component
 */
export interface HistoryPageClientProps {
  initialReadingHistory: HistoryItem[];
  initialViewHistory: HistoryItem[];
  stats?: any; // UserStatsResponse
}
