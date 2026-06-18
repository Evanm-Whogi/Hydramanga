export const HOMEPAGE_CAROUSEL_LIMIT = 30;
export const HOMEPAGE_TRENDING_PERIOD = "2weeks" as const;

const carouselItemBase = "min-w-0 shrink-0 grow-0";

export const HOMEPAGE_CAROUSEL_ITEM_CLASS =
  `${carouselItemBase} basis-[calc((100%-1rem)/2)] sm:basis-[calc((100%-2rem)/3)] lg:basis-[calc((100%-11rem)/10)]`;

export const HOMEPAGE_COMMENTER_CAROUSEL_ITEM_CLASS =
  `${carouselItemBase} basis-[calc((100%-1rem)/2)] sm:basis-[calc((100%-2rem)/3)] lg:basis-[calc((100%-11rem)/10)]`;

export const HOMEPAGE_COMMENT_CAROUSEL_ITEM_CLASS =
  `${carouselItemBase} basis-full sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)]`;

export const HOMEPAGE_PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
] as const;

export const HOMEPAGE_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Manga", label: "Manga" },
  { value: "Manhwa", label: "Manhwa" },
  { value: "Manhua", label: "Manhua" },
] as const;
