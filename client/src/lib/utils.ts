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
  // Normalize a 0-100 score to a 0-5 scale, then trim
  const activeStars = Math.floor(score / 20); 
  
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
        const rawValue = value.split('Z')[0].split('+')[0]; 
        const normalized = rawValue.replace(' ', 'T');
        date = new Date(normalized);
    }

    if (Number.isNaN(date.getTime())) return 'unknown';

    const now = Date.now();
    // diffMs will now be the difference between "Now" and the "Raw Numbers"
    const diffMs = Math.max(0, now - date.getTime());
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    // ... (rest of your logic for weeks/months/years)
    const weeks = Math.floor(diffDays / 7);
    if (diffDays < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    
    const months = Math.floor(diffDays / 30);
    if (diffDays < 365) return `${months} month${months === 1 ? '' : 's'} ago`;
    
    const years = Math.floor(diffDays / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
};