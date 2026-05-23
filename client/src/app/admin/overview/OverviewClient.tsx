"use client";

import { useEffect, useState } from "react";
import {Activity, Users, BookOpen, Eye, ListOrdered, Download, AlertTriangle, CheckCircle2, XCircle, Loader2} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getHeartbeat } from "@/services/healthservice";
import { getAdminOverviewStats, getAdminTimeseries, type AdminOverviewStats, type AdminTimeseries } from "@/services/adminStatsService";
import AdminStatCard from "../components/AdminStatCard";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatChartDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChartPanelProps {
  title: string;
  data: { date: string; count: number }[];
  stroke: string;
}

const CHART_HEIGHT = 224;

function ChartPanel({ title, data, stroke }: ChartPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30 min-w-0">
      <h3 className="text-sm font-semibold text-muted mb-4">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted">No data yet</p>
      ) : !mounted ? (
        <div
          className="w-full min-w-0 animate-pulse rounded bg-background/50"
          style={{ height: CHART_HEIGHT }}
        />
      ) : (
        <div className="w-full min-w-0" style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borders)" opacity={0.4} />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-foreground)",
                  border: "1px solid var(--color-borders)",
                  borderRadius: "8px",
                  color: "var(--color-primary)",
                }}
                labelFormatter={(label) => formatChartDate(String(label))}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={stroke}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function OverviewClient() {
  const [health, setHealth] = useState<"loading" | "ok" | "error">("loading");
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [timeseries, setTimeseries] = useState<AdminTimeseries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [heartbeatResult, statsResult, timeseriesResult] = await Promise.allSettled([
          getHeartbeat(),
          getAdminOverviewStats(),
          getAdminTimeseries(30),
        ]);

        if (cancelled) return;

        setHealth(heartbeatResult.status === "fulfilled" ? "ok" : "error");
        if (statsResult.status === "fulfilled") setStats(statsResult.value);
        if (timeseriesResult.status === "fulfilled") setTimeseries(timeseriesResult.value);
        if (statsResult.status === "rejected" && timeseriesResult.status === "rejected") {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        // Always clear loading (avoids stuck state under React Strict Mode remounts)
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-muted">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading overview…</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-foreground/50 rounded-lg border border-borders/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-foreground rounded-lg border border-borders p-8 text-center">
        <p className="text-primary font-semibold">Failed to load overview stats</p>
        <p className="text-sm text-muted mt-2">Check that you have admin access and the API is running.</p>
      </div>
    );
  }

  const queueBacklog =
    (stats?.queues.waiting ?? 0) +
    (stats?.queues.active ?? 0) +
    (stats?.queues.delayed ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-foreground/50 rounded-lg p-6 border border-borders/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted">API Health</h3>
            <Activity className="size-5 text-green-400" />
          </div>
          <div className="flex items-center gap-2">
            {health === "ok" && (
              <>
                <CheckCircle2 className="size-5 text-green-400" />
                <span className="text-primary font-semibold">Healthy</span>
              </>
            )}
            {health === "error" && (
              <>
                <XCircle className="size-5 text-red-400" />
                <span className="text-primary font-semibold">Unreachable</span>
              </>
            )}
          </div>
          <p className="text-xs text-muted mt-1">Admin heartbeat endpoint</p>
        </div>

        <AdminStatCard
          label="Total Users"
          value={stats ? formatNumber(stats.users.total) : "—"}
          hint={
            stats
              ? `+${stats.users.newLast7Days} this week · ${stats.users.admins} admins`
              : undefined
          }
          icon={Users}
          iconClassName="text-blue-400"
        />
        <AdminStatCard
          label="Manga Catalog"
          value={stats ? formatNumber(stats.manga.totalSeries) : "—"}
          hint={
            stats
              ? `${formatNumber(stats.manga.seriesWithChapters)} with chapters`
              : undefined
          }
          icon={BookOpen}
          iconClassName="text-purple-400"
        />
        <AdminStatCard
          label="Total Views"
          value={stats ? formatNumber(stats.views.totalViews) : "—"}
          hint="All-time manga page views"
          icon={Eye}
          iconClassName="text-yellow-400"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Active Imports"
          value={stats?.manga.activeImports ?? "—"}
          hint="Currently scanning or downloading"
          icon={Download}
          iconClassName="text-teal-400"
        />
        <AdminStatCard
          label="Failed Imports"
          value={stats?.manga.failedImports ?? "—"}
          hint="Needs attention"
          icon={AlertTriangle}
          iconClassName="text-red-400"
        />
        <AdminStatCard
          label="Queue Backlog"
          value={stats ? formatNumber(queueBacklog) : "—"}
          hint={
            stats
              ? `${stats.queues.waiting} waiting · ${stats.queues.active} active`
              : undefined
          }
          icon={ListOrdered}
          iconClassName="text-orange-400"
        />
        <AdminStatCard
          label="New Users (30d)"
          value={stats?.users.newLast30Days ?? "—"}
          hint="Signups in the last 30 days"
          icon={Users}
          iconClassName="text-green-400"
        />
      </div>

      {timeseries && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
          <ChartPanel
            title="User signups (30d)"
            data={timeseries.userSignups}
            stroke="#60a5fa"
          />
          <ChartPanel
            title="Manga views (30d)"
            data={timeseries.mangaViews}
            stroke="#c084fc"
          />
          <ChartPanel
            title="Import completions (30d)"
            data={timeseries.importCompletions}
            stroke="#2dd4bf"
          />
        </div>
      )}
    </div>
  );
}
