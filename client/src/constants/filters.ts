export const FILTER_OPTIONS = {
  genres: [
    "Action", "Adult", "Hentai", "Adventure", "Avant Garde", "Award Winning", "Boys Love",
    "Comedy", "Doujinshi", "Drama", "Ecchi", "Lolicon", "Shotacon", "Erotica", "Smut", "Fantasy", "Gender Bender",
    "Girls Love", "Gourmet", "Harem", "Historical", "Horror", "Josei", "Mahou Shoujo",
    "Martial Arts", "Mature", "Mecha", "Music", "Mystery", "Psychological", "Romance",
    "School Life", "Sci-Fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai",
    "Slice of Life", "Sports", "Supernatural", "Suspense", "Thriller", "Tragedy",
    "Yaoi", "Yuri"
  ] as const,

  types: ["Manga", "Manhua", "Manhwa", "Oel", "Other"] as const,

  sort: [
    { label: "Most Popular", value: "mostPopular" },
    { label: "Highest Rated", value: "topRated" },
    { label: "Recently Updated", value: "recentlyUpdated" },
    { label: "Trending", value: "trending" },
    { label: "Trending 7D", value: "trending7d" },
    { label: "Trending 30D", value: "trending30d" },
    { label: "Total Chapters", value: "totalChapters" },
    { label: "Title", value: "title" },
    { label: "Year", value: "year" },
  ] as const,

  status: [
    { label: "Ongoing", value: "releasing" },
    { label: "Complete", value: "completed" },
    { label: "Hiatus", value: "hiatus" },
    { label: "Canceled", value: "cancelled" },
    { label: "Upcoming", value: "upcoming" },
    { label: "Imported", value: "imported" }
  ] as const,

  years: [
    { label: "Timeless", value: "timeless" },
    { label: "2026", value: "2026" },
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
  tags: [] as string[],
  types: [] as string[],
  statuses: [] as string[],
  years: [] as string[],
  sort: "mostPopular",
} as const;

export const WARNING_GENRES = ["Hentai", "Adult", "Doujinshi", "Lolicon", "Shotacon", "Erotica", "Smut"] as const;
export const WARNING_RATINGS = ["suggestive", "erotica", "pornographic"] as const;