// truncate based on word count replaced by tailwind truncate but ill leave it incase I have a specific use-case
export function truncate(text: string, maxLength: number) {
  const words = text.split(" ");
  return words.length > maxLength ? words.slice(0, maxLength).join(" ") + "..." : text;
}

// Format Dates
export function formatDate(date: string | Date) {
  const actualDate = typeof date === "string" ? new Date(date) : date;
  return actualDate.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
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