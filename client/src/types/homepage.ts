export type HomepagePeriod = "today" | "week" | "month" | "all";
export type HomepageMangaType = "all" | "Manga" | "Manhwa" | "Manhua";

export type HomepageSeriesCard = {
  id: number;
  title: string;
  cover?: unknown;
  type?: string | null;
  status?: string | null;
  rating?: number | null;
  views?: number | null;
  totalChapters?: string | number | null;
  isNew?: boolean;
  firstChapterId?: number;
};

export type HomepageSaveTarget = { seriesId: number; title: string };

export type HomepageReadingProgress = {
  seriesId: number;
  seriesTitle: string;
  seriesCover?: unknown;
  lastChapterId: number;
  lastPageNumber: number;
};

export type HomepageListChapterItem = {
  series: HomepageSeriesCard;
  chapter: { id: number };
};
