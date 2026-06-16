"use client";

import { useEffect, useState } from "react";
import { getUserStats } from "@/services/mangaService";
import { getProfileStats } from "@/services/profileService";
import type { UserStats } from "@/types/stats";
import { formatCompactNumber as formatNumber } from "@/lib/utils";
import BreakdownBars, { TYPE_COLORS, TYPE_ORDER } from "./BreakdownBars";

const TYPE_LABELS = { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua", other: "Other" };

export default function ReadingStats({ identifier, initialStats }: { identifier?: string; initialStats?: Partial<UserStats> | null }) {
  const [stats, setStats] = useState<UserStats | null>((initialStats as UserStats | undefined) ?? null);
  const [loading, setLoading] = useState(!initialStats);

  useEffect(() => {
    if (initialStats) {
      setStats(initialStats as UserStats);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchData = async () => {
      try {
        const data = identifier
          ? await getProfileStats(identifier)
          : await getUserStats();
        if (!cancelled) setStats(data.stats);
      } catch (error) {
        if (!cancelled) console.error("Failed to fetch reading stats:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [identifier, initialStats]);

  if (loading) {
    return (
      <div className="bg-foreground rounded-lg p-6 shadow-md">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-background rounded w-1/3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="h-16 bg-background rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const metrics = [
    { value: formatNumber(stats.reputation ?? stats.karma?.totalKarma ?? 0), label: "Reputation" },
    { value: formatNumber(stats.totalSeriesReading ?? 0), label: "Manga Read" },
    { value: formatNumber(stats.chaptersRead ?? 0), label: "Chapters Read" },
    { value: formatNumber(stats.bookmarks ?? stats.seriesSaved ?? 0), label: "Bookmarks" },
    { value: formatNumber(stats.daysActive ?? 0), label: "Days Active" },
    { value: formatNumber(stats.comments ?? 0), label: "Comments" },
    { value: formatNumber(stats.upvotes ?? 0), label: "Upvotes" },
    { value: formatNumber(stats.downvotes ?? 0), label: "Downvotes" },
  ];

  return (
    <div className="bg-foreground rounded-lg p-6 w-full shadow-md">
      <h3 className="text-xl font-bold text-primary mb-4">Reading Statistics</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 mb-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-background rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-primary">{metric.value}</p>
            <p className="text-xs text-muted mt-1">{metric.label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/2">
          <BreakdownBars title="Types Read" breakdown={stats.typeBreakdown ?? {}} labels={TYPE_LABELS} colors={TYPE_COLORS} fixedOrder={TYPE_ORDER} stackedBar />
        </div>
        <div className="w-full md:w-1/2">
          <BreakdownBars title="Genres Read" breakdown={stats.genreBreakdown ?? {}} stackedBar stackedBarLimit={4} initialVisibleCount={4} />
        </div>
      </div>
    </div>
  );
}
