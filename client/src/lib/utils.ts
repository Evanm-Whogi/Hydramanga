// truncate based on word count replaced by tailwind truncate but ill leave it incase I have a specific use-case
export function truncate(text: string, maxLength: number) {
  const words = text.split(" ");
  return words.length > maxLength ? words.slice(0, maxLength).join(" ") + "..." : text;
}

// Format Dates
export function formatDate(date: string | Date, noTime: boolean = false) {
  const actualDate = typeof date === "string" ? new Date(date) : date;
  return actualDate.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: noTime ? undefined : "short",
    hour12: true,
  });
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

// Convert 0-5 rating to stars
export const ratingToStars = (rating: number) => {
  const totalStars = 5;
  const clampedRating = Math.min(Math.max(rating, 0), totalStars);
  const emptyStarsCount = totalStars - clampedRating;

  const stars = '★'.repeat(clampedRating);
  const emptyStars = '☆'.repeat(emptyStarsCount);
  
  return stars + emptyStars;
}

export const formatTimeAgo = (value?: string | Date | null): string => {
    if (!value) return 'unknown';

    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else {
        let normalized = value.replace(' ', 'T');
        // Trim fractional seconds to 3 digits (JS Date only supports up to milliseconds)
        normalized = normalized.replace(/\.\d+/, (m) => m.slice(0, 4));
        // Normalize timezone offset to ±HH:MM format
        normalized = normalized.replace(/([+-])(\d{2}):?(\d{2})$/, '$1$2:$3');
        normalized = normalized.replace(/([+-])(\d{2})$/, '$1$2:00');
        // If no timezone present, assume UTC
        if (!/([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)) {
      }
      date = new Date(normalized);
    }

    if (Number.isNaN(date.getTime())) return 'unknown';

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