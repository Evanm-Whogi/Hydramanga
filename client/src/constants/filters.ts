export const FILTER_OPTIONS = {
  genres: [
    "Action", "Adult", "Hentai", "Lolicon", "Shotacon", "Adventure", "Avant Garde", "Award Winning", "Boys Love",
    "Comedy", "Doujinshi", "Drama", "Ecchi", "Erotica", "Fantasy", "Gender Bender",
    "Girls Love", "Gourmet", "Harem", "Historical", "Horror", "Josei", "Mahou Shoujo",
    "Martial Arts", "Mature", "Mecha", "Music", "Mystery", "Psychological", "Romance",
    "School Life", "Sci-Fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai",
    "Slice of Life", "Smut", "Sports", "Supernatural", "Suspense", "Thriller", "Tragedy",
    "Yaoi", "Yuri"
  ] as const,

  types: ["Manga", "Manhua", "Manhwa", "Novel", "Oel", "Other"] as const,

  sort: [
    { label: "Popular", value: "weightedScore" },
    { label: "Total Chapters", value: "totalChapters" },
    { label: "Recently Added", value: "lastUpdatedAt" },
    { label: "Title", value: "title" },
    { label: "Year", value: "year" }
  ] as const,

  status: [
    { label: "Ongoing", value: "releasing" },
    { label: "Complete", value: "completed" },
    { label: "Hiatus", value: "hiatus" },
    { label: "Canceled", value: "cancelled" },
    { label: "Upcoming", value: "upcoming" }
  ] as const,

  years: [
    { label: "Timeless", value: "timeless" },
    { label: "2025", value: "2025" },
    { label: "2024", value: "2024" },
    { label: "2023", value: "2023" },
    { label: "2022", value: "2022" },
    { label: "2021", value: "2021" },
    { label: "2020", value: "2020" },
    { label: "2010s", value: "2010s" },
    { label: "2000s", value: "2000s" },
    { label: "1990s", value: "1990s" },
    { label: "1980s", value: "1980s" },
    { label: "1970s", value: "1970s" },
    { label: "1960s", value: "1960s" },
    { label: "1950s", value: "1950s" },
    { label: "1940s", value: "1940s" }
  ] as const
} as const;

export const DEFAULT_FILTERS = {
  search: "",
  genres: [] as string[],
  types: [] as string[],
  statuses: [] as string[],
  years: [] as string[],
  sort: "weightedScore",
  nsfw: "true"
} as const;

export const DEFAULT_NSFW_VALUE = "true";
export const SORT_DEFAULT = "weightedScore";
