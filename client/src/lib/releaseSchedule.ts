export const RELEASE_SAMPLE_SIZE = 15;

export type ReleaseScheduleConfidence = 'medium' | 'low';

export type ReleaseSchedule = {
  cadenceLabel: string;
  medianIntervalDays: number;
  predictedNext: Date;
  lastRelease: Date;
  sampleSize: number;
  confidence: ReleaseScheduleConfidence;
  isOverdue: boolean;
  overdueDays?: number;
};

type ChapterWithCreatedAt = { createdAt?: string | null };

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function classifyCadence(medianDays: number): string {
  if (medianDays < 3) return 'Daily';
  if (medianDays < 10) return 'Weekly';
  if (medianDays < 18) return 'Biweekly';
  if (medianDays < 45) return 'Monthly';
  if (medianDays < 90) return 'Bimonthly';
  return 'Quarterly';
}

export function computeReleaseSchedule(chapters: ChapterWithCreatedAt[], seriesStatus?: string | null): ReleaseSchedule | null {
  if (seriesStatus === 'completed') return null;

  const dated = chapters
    .map((chapter) => parseTimestamp(chapter.createdAt))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, RELEASE_SAMPLE_SIZE);

  if (dated.length < 3) return null;

  const intervalMs: number[] = [];
  for (let i = 0; i < dated.length - 1; i++) {
    const gap = dated[i].getTime() - dated[i + 1].getTime();
    if (gap > 0) intervalMs.push(gap);
  }

  if (intervalMs.length < 2) return null;

  const medianIntervalMs = median(intervalMs);
  const medianIntervalDays = medianIntervalMs / (1000 * 60 * 60 * 24);
  const avgIntervalMs = mean(intervalMs);
  const stdDev = standardDeviation(intervalMs, avgIntervalMs);
  const coefficientOfVariation = avgIntervalMs > 0 ? stdDev / avgIntervalMs : 0;
  const isIrregular = coefficientOfVariation > 0.6;

  const lastRelease = dated[0];
  const predictedNext = new Date(lastRelease.getTime() + medianIntervalMs);
  const now = Date.now();
  const isOverdue = predictedNext.getTime() < now;
  const overdueDays = isOverdue ? Math.floor((now - predictedNext.getTime()) / (1000 * 60 * 60 * 24)) : undefined;

  return {
    cadenceLabel: isIrregular ? 'Irregular' : classifyCadence(medianIntervalDays),
    medianIntervalDays,
    predictedNext,
    lastRelease,
    sampleSize: dated.length,
    confidence: isIrregular ? 'low' : 'medium',
    isOverdue,
    overdueDays,
  };
}
