/**
 * Utility functions for history-related features
 */

import { getCardCoverUrl } from '@/lib/coverUtils';

/**
 * Format seconds to human-readable time format (e.g., "10H 30M" or "45m" or "30s")
 * @param seconds - Total seconds to format
 * @param format - Format type: 'full' for "10H 30M", 'short' for "45m" or "30s"
 * @returns Formatted string
 */
export function formatReadingTime(seconds: number, format: 'full' | 'short' = 'full'): string {
  const numSeconds = Number(seconds);

  if (!Number.isFinite(numSeconds) || numSeconds < 0) {
    return format === 'full' ? '0H 0M' : '0s';
  }

  if (format === 'short') {
    if (numSeconds < 60) return `${Math.floor(numSeconds)}s`;
    if (numSeconds < 3600) return `${Math.floor(numSeconds / 60)}m`;
    return `${Math.floor(numSeconds / 3600)}h`;
  }

  // full format
  const hours = Math.floor(numSeconds / 3600);
  const minutes = Math.floor((numSeconds % 3600) / 60);
  return `${hours}H ${minutes}M`;
}

/**
 * Convert a date to a relative time string (e.g., "2 hours ago")
 * @param date - Date to convert
 * @returns Relative time string
 */
export function getTimeAgo(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

/** @deprecated Prefer getCardCoverUrl — kept for existing imports */
export function getCoverUrl(cover: unknown): string {
  return getCardCoverUrl(cover);
}

/**
 * Sort history items based on sort option
 * @param items - Array of history items to sort
 * @param sortBy - Sort option
 * @returns Sorted array
 */
export function sortHistoryItems(
  items: any[],
  sortBy: 'recent' | 'oldest' | 'title' | 'progress'
): any[] {
  const itemsCopy = [...items];

  switch (sortBy) {
    case 'recent':
      return itemsCopy.sort((a, b) => {
        const dateA = new Date(a.viewedAt || a.readAt || 0).getTime();
        const dateB = new Date(b.viewedAt || b.readAt || 0).getTime();
        return dateB - dateA;
      });
    case 'oldest':
      return itemsCopy.sort((a, b) => {
        const dateA = new Date(a.viewedAt || a.readAt || 0).getTime();
        const dateB = new Date(b.viewedAt || b.readAt || 0).getTime();
        return dateA - dateB;
      });
    case 'title':
      return itemsCopy.sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle));
    case 'progress':
      return itemsCopy.sort(
        (a, b) => (b.completionPercentage || 0) - (a.completionPercentage || 0)
      );
    default:
      return itemsCopy;
  }
}
