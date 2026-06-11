import type { Job } from 'bullmq';

export function clampProgress(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export async function setJobProgress(job: Job | undefined, percent: number): Promise<void> {
  if (!job) return;
  await job.updateProgress(clampProgress(percent));
}

/** Map item index within a batch to a sub-range [start, end] of overall progress. */
export function progressForIndex(index: number, total: number, start: number, end: number): number {
  if (total <= 0) return clampProgress(end);
  return clampProgress(start + ((index + 1) / total) * (end - start));
}

export function parseJobProgressValue(progress: unknown): number | null {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return clampProgress(progress);
  }
  if (typeof progress === 'string') {
    const parsed = Number(progress);
    if (Number.isFinite(parsed)) return clampProgress(parsed);
    try {
      const json = JSON.parse(progress);
      if (typeof json === 'number' && Number.isFinite(json)) return clampProgress(json);
    } catch {
      return null;
    }
  }
  return null;
}
