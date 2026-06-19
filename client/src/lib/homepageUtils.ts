import { mangaPath, mangaReadPath } from "@/lib/paths";
import { HOMEPAGE_CAROUSEL_LIMIT } from "@/constants/homepage";
import type { HomepageReadingProgress, HomepageSeriesCard } from "@/types/homepage";

export function limitHomepageItems<T>(items: T[], max = HOMEPAGE_CAROUSEL_LIMIT): T[] {
  return items.slice(0, max);
}

export function formatHeroStatus(status?: string | null): string {
  if (!status) return "Unknown";
  if (status === "releasing") return "Releasing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function progressReadHref(progress: HomepageReadingProgress): string {
  return `/manga/${progress.seriesId}/read/${progress.lastChapterId}?page=${progress.lastPageNumber}`;
}

export function seriesCardHref(series: HomepageSeriesCard): string {
  return mangaPath(series.id);
}

export function heroReadHref(series: HomepageSeriesCard): string {
  return series.firstChapterId ? mangaReadPath(series.id, series.firstChapterId) : mangaPath(series.id);
}
