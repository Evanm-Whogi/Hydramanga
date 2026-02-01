'use client';

import { BookOpen, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { UserStats, MangaReadingTime } from '@/types/stats';

interface StatisticsProps {
  mangaStats: {
    stats: UserStats;
  };
}

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}

const StatCard = ({ icon, value, label }: StatCardProps) => (
  <div className="bg-foreground rounded-lg p-4 flex items-start flex-1 min-w-0">
    <div className="bg-accent/20 rounded-lg p-3 mr-4 flex-shrink-0">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-2xl font-bold text-primary truncate">{value}</p>
      <p className="text-sm text-muted truncate">{label}</p>
    </div>
  </div>
);

/**
 * Format seconds to human-readable time format
 * @param seconds Total seconds to format
 * @returns Formatted string like "10H 30M"
 */
const formatTime = (seconds: number | string | undefined): string => {
  const numSeconds = typeof seconds === 'string' ? parseInt(seconds, 10) : Number(seconds);
  
  if (!Number.isFinite(numSeconds) || numSeconds < 0) return '0H 0M';
  
  const hours = Math.floor(numSeconds / 3600);
  const minutes = Math.floor((numSeconds % 3600) / 60);
  return `${hours}H ${minutes}M`;
};

/**
 * Calculate the width percentage for the reading time bar
 * Uses min-max normalization to scale values between minWidth and maxWidth
 */
const calculateBarWidth = (
  totalSeconds: number,
  minSeconds: number,
  maxSeconds: number
): string => {
  if (maxSeconds === minSeconds || maxSeconds === 0) return '100%';

  const normalized = (totalSeconds - minSeconds) / (maxSeconds - minSeconds);
  const minWidth = 20; // percent
  const maxWidth = 100; // percent
  const width = minWidth + normalized * (maxWidth - minWidth);

  return `${Math.max(minWidth, Math.min(maxWidth, width))}%`;
};

/**
 * Reading time list item component
 */
const ReadingTimeItem = ({
  manga,
  barWidth,
}: {
  manga: MangaReadingTime;
  barWidth: string;
}) => (
  <Link
    href={`/manga/${manga.seriesId}`}
    className="flex flex-row items-center space-x-3 mb-4 hover:opacity-80 transition-opacity group mr-24"
  >
    <div
      className="bg-background rounded-md flex justify-end items-center shrink-0"
      style={{ width: barWidth, transition: 'width 0.3s ease-out' }}
    >
      <img
        src={manga.image.raw.url}
        alt={manga.title}
        className="w-24 h-32 object-cover rounded-md group-hover:shadow-lg transition-shadow"
        loading="lazy"
      />
    </div>
    <div className="flex flex-col space-y-1 flex-1 min-w-0">
      <h3 className="font-medium text-primary truncate-1 group-hover:underline">
        {manga.title}
      </h3>
      <span className="text-muted text-sm">{formatTime(manga.totalSeconds)}</span>
    </div>
  </Link>
);

export default function Statistics({ mangaStats }: StatisticsProps) {
  const { stats } = mangaStats;

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Unable to load statistics</p>
      </div>
    );
  }

  const { totalSeriesReading, averageCompletion, totalPagesRead, readingTimes } =
    stats;

  // Helper to safely convert totalSeconds to number
  const toSeconds = (value: any): number => {
    const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  };

  // Calculate total reading time
  const totalSeconds = readingTimes.reduce(
    (acc: number, manga: MangaReadingTime) => acc + toSeconds(manga.totalSeconds),
    0
  );

  // Sort by reading time descending
  const sortedReadingTimes = [...readingTimes].sort(
    (a, b) => toSeconds(b.totalSeconds) - toSeconds(a.totalSeconds)
  );

  // Calculate min/max for bar width normalization
  const readingTimesSeconds = sortedReadingTimes.map((m) => toSeconds(m.totalSeconds));
  const minSeconds = Math.min(...readingTimesSeconds);
  const maxSeconds = Math.max(...readingTimesSeconds);

  // Handle empty state
  if (sortedReadingTimes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">
          No reading data available yet. Start reading manga to see statistics!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview Cards */}
      <div className="flex flex-col lg:flex-row gap-4">
        <StatCard
          icon={<BookOpen className="size-6 text-accent" />}
          value={totalSeriesReading}
          label="Series Read"
        />
        <StatCard
          icon={<TrendingUp className="size-6 text-accent" />}
          value={`${Math.round(averageCompletion ?? 0)}%`}
          label="Average Completion"
        />
        <StatCard
          icon={<Target className="size-6 text-accent" />}
          value={totalPagesRead || 0}
          label="Pages Read"
        />
      </div>

      {/* Total Reading Time and Breakdown */}
      <div className="bg-foreground rounded-lg p-6 lg:p-8">
        <div className="mb-6">
          <h2 className="text-3xl lg:text-4xl font-bold text-primary">
            {formatTime(totalSeconds)}
          </h2>
          <p className="text-muted text-sm mt-1">
            Total reading time since registration
          </p>
        </div>

        {/* Reading Time List */}
        <div className="space-y-2">
          {sortedReadingTimes.map((manga) => (
            <ReadingTimeItem
              key={`${manga.seriesId}-${manga.title}`}
              manga={manga}
              barWidth={calculateBarWidth(
                toSeconds(manga.totalSeconds),
                minSeconds,
                maxSeconds
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
