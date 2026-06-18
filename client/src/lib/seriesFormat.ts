export function formatDisplayStatus(status?: string | null): string {
  if (!status) return "Unknown";
  if (status === "releasing") return "Ongoing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatChapterCount(totalChapters?: string | number | null): string {
  if (totalChapters == null || totalChapters === "") return "0";
  const count = Number(totalChapters);
  return Number.isFinite(count) ? String(count) : "0";
}
