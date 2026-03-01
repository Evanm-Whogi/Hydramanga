"use client";

import { useEffect, useState } from "react";
import { getUserStats } from "@/services/mangaService";
import type { UserStats } from "@/types/stats";
import { BookOpen, TrendingUp, Target, BookCheckIcon, FlameIcon } from "lucide-react";

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export default function ReadingStats() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const { stats: statsData } = await getUserStats();
        if (!cancelled) setStats(statsData);
      } catch (error) {
        if (!cancelled) console.error("Failed to fetch reading stats:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-foreground rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-background rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-background rounded" />
            <div className="h-20 bg-background rounded" />
            <div className="h-20 bg-background rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 pb-5">
      <div className="bg-foreground rounded-lg p-6">
        <h3 className="text-xl font-bold text-primary mb-4">Reading Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={<BookOpen className="size-6 text-accent" />} iconBg="bg-accent/20" value={stats.totalSeriesReading ?? 0} label="Series Read" />
          <StatCard icon={<TrendingUp className="size-6 text-blue-400" />} iconBg="bg-blue-500/20" value={`${Math.round(stats.averageCompletion ?? 0)}%`} label="Avg. Completion" />
          <StatCard icon={<Target className="size-6 text-green-400" />} iconBg="bg-green-500/20" value={formatNumber(stats.totalPagesRead ?? 0)} label="Pages Read" />
          <StatCard icon={<BookCheckIcon className="size-6 text-blue-400" />} iconBg="bg-green-500/20" value={formatNumber(stats.seriesSaved ?? 0)} label="Series Saved" />
          <StatCard icon={<FlameIcon className="size-6 text-yellow-400" />} iconBg="bg-green-500/20" value={stats.streak ?? 0} label="Streak" />
        </div>
      </div>
    </div>
  );
}

function StatCard({icon, iconBg, value, label}: {
  icon: React.ReactNode;
  iconBg: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className="bg-background rounded-lg p-4 flex items-start">
      <div className={`${iconBg} rounded-lg p-3 mr-4`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-primary">{value}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </div>
  );
}
