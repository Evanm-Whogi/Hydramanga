export function formatJobProgress(progress: number | string | null): { label: string; percent: number | null } {
  if (progress == null) return { label: "—", percent: null };

  if (typeof progress === "number" && Number.isFinite(progress)) {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    return { label: `${clamped}%`, percent: clamped };
  }

  if (typeof progress === "string") {
    const parsed = Number(progress);
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
      return { label: `${clamped}%`, percent: clamped };
    }
  }

  return { label: String(progress), percent: null };
}

export function formatActiveJobsProgress(
  jobs: Array<{ summary: string; progress: number | null }>
): string | null {
  if (jobs.length === 0) return null;
  const withProgress = jobs.filter((j) => j.progress != null);
  if (withProgress.length === 0) return `${jobs.length} active`;
  if (jobs.length === 1) {
    return `${withProgress[0].progress}%`;
  }
  const parts = jobs
    .slice(0, 3)
    .map((j) => (j.progress != null ? `${j.progress}%` : "…"))
    .join(", ");
  return jobs.length > 3 ? `${parts}, +${jobs.length - 3}` : parts;
}
