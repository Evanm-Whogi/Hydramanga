// Compact number formatting (e.g. 1.2K, 3.4M) for view/follower counts
export function formatCompactNumber(num: number | null | undefined): string {
  const n = num ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// Convert to Stars
export const formatToRating = (rating: number | null, maxScale: number = 100): number => {
  if (!rating) return 0;
  const stars = (rating / maxScale) * 5;
  return Math.round(stars * 10) / 10;
};

export const formatToStars = (score: number) => {
  const totalStars = 5;

  // Normalize from 0-10 
  const activeStars = Math.round((score / 10) * totalStars);

  // Ensure the value never goes below 0 or above 5 to prevent errors
  const clampedStars = Math.min(Math.max(activeStars, 0), totalStars);
  const emptyStarsCount = totalStars - clampedStars;

  const stars = '★'.repeat(clampedStars);
  const emptyStars = '☆'.repeat(emptyStarsCount);
  
  return stars + emptyStars;
};

function parseDisplayDate(value?: string | Date | null): Date | null {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    // Date-only ISO (YYYY-MM-DD): skip timezone-offset rewrites — the day
    // segment (e.g. -11) matches ±HH and would become "YYYY-MM-DD:00".
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(`${value}T00:00:00Z`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    let normalized = value.replace(' ', 'T');
    // Trim fractional seconds to 3 digits (JS Date only supports up to milliseconds)
    normalized = normalized.replace(/\.\d+/, (m) => m.slice(0, 4));
    // Normalize timezone offset to ±HH:MM format
    normalized = normalized.replace(/([+-])(\d{2}):?(\d{2})$/, '$1$2:$3');
    normalized = normalized.replace(/([+-])(\d{2})$/, '$1$2:00');
    // If no timezone present, assume UTC (server timestamps are UTC)
    if (!/([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)) {
        normalized += 'Z';
    }
    const date = new Date(normalized);

    return Number.isNaN(date.getTime()) ? null : date;
}

export const formatTimeAgo = (value?: string | Date | null): string => {
    const date = parseDisplayDate(value);
    if (!date) return 'unknown';

    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    const weeks = Math.floor(diffDays / 7);
    if (diffDays < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;

    const months = Math.floor(diffDays / 30);
    if (diffDays < 365) return `${months} month${months === 1 ? '' : 's'} ago`;

    const years = Math.floor(diffDays / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
};

export function formatDisplayDate(value?: string | Date | null): string {
    const date = parseDisplayDate(value);
    if (!date) return 'unknown';
    return date.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'});
}

export function formatCompactDisplayDate(value?: string | Date | null): string {
    const date = parseDisplayDate(value);
    if (!date) return 'unknown';
    return date.toLocaleDateString('en-US', {year: 'numeric', month: 'short', timeZone: 'UTC'});
}

export function formatPublishedRange(start?: string | Date | null, end?: string | Date | null): string {
    const startDate = parseDisplayDate(start);
    if (!startDate) return 'unknown';
    const endDate = parseDisplayDate(end);
    if (!endDate || startDate.getTime() === endDate.getTime()) return formatCompactDisplayDate(startDate);
    const startYear = startDate.getUTCFullYear();
    const endYear = endDate.getUTCFullYear();
    const startMonth = startDate.toLocaleDateString('en-US', {month: 'short', timeZone: 'UTC'});
    const endMonth = endDate.toLocaleDateString('en-US', {month: 'short', timeZone: 'UTC'});
    if (startYear === endYear) return `${startMonth} – ${endMonth} ${endYear}`;
    return `${startMonth} ${startYear} – ${endMonth} ${endYear}`;
}

/** Cross-year ranges (e.g. "Jan 2020 – Mar 2022") are long enough to warrant smaller sidebar text. */
export function isLongPublishedRange(text: string): boolean {
    return text.length > 18;
}

export function formatTimeUntil(value?: string | Date | null): string {
    const date = parseDisplayDate(value);
    if (!date) return 'unknown';

    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return 'soon';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 24) return 'soon';
    if (diffDays === 1) return 'in 1 day';
    if (diffDays < 7) return `in ${diffDays} days`;

    const weeks = Math.floor(diffDays / 7);
    if (diffDays < 30) return `in ${weeks} week${weeks === 1 ? '' : 's'}`;

    const months = Math.floor(diffDays / 30);
    if (diffDays < 365) return `${months} month${months === 1 ? '' : 's'} away`;

    const years = Math.floor(diffDays / 365);
    return `${years} year${years === 1 ? '' : 's'} away`;
}

export function formatOverdueDuration(days: number): string {
    if (days < 1) return 'overdue';
    if (days === 1) return 'overdue by 1 day';
    if (days < 7) return `overdue by ${days} days`;

    const weeks = Math.floor(days / 7);
    if (days < 30) return `overdue by ${weeks} week${weeks === 1 ? '' : 's'}`;

    const months = Math.floor(days / 30);
    if (days < 365) return `${months} month${months === 1 ? '' : 's'} overdue`;

    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? '' : 's'} overdue`;
}