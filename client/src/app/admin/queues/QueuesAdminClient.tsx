"use client";

import {useCallback, useEffect, useState } from "react";
import {ListOrdered, Loader2, RefreshCw, Clock, Play, Pause, AlertTriangle, CheckCircle2, XCircle, Timer, EllipsisVertical, Trash2} from "lucide-react";
import {toast } from "react-toastify";
import {getAdminQueues, pauseAdminQueue, resumeAdminQueue, clearAdminQueue, type AdminQueueRow, type AdminQueueTotals} from "@/services/adminQueueService";
import AdminStatCard from "../components/AdminStatCard";
import QueueExploreModal from "./QueueExploreModal";
import JobProgressDisplay from "./JobProgressDisplay";
import { formatActiveJobsProgress } from "@/lib/jobProgress";
import { formatCompactNumber as formatNumber } from "@/lib/utils";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return "<1s";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function statusBadgeClass(status: AdminQueueRow["status"]): string {
  switch (status) {
    case "Active":
      return "bg-green-500/20 text-green-400";
    case "Paused":
      return "bg-amber-500/20 text-amber-400";
    case "Unavailable":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-background text-muted";
  }
}

function healthHint(row: AdminQueueRow): string | null {
  if (row.status === "Unavailable") return row.error ?? "Could not reach Redis";
  if (row.status === "Paused") return "Queue is paused";
  if (row.failed > 0) return `${formatNumber(row.failed)} failed jobs retained`;
  if (row.waiting > 50) return "Large backlog";
  if (row.active > 0) return "Processing jobs now";
  if (row.waiting === 0 && row.active === 0) return "Idle";
  return null;
}

function totalJobs(row: AdminQueueRow): number {
  return row.waiting + row.active + row.delayed + row.failed + row.completed;
}

export default function QueuesAdminClient() {
  const [queues, setQueues] = useState<AdminQueueRow[]>([]);
  const [totals, setTotals] = useState<AdminQueueTotals | null>(null);
  const [redisAvailable, setRedisAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exploringQueue, setExploringQueue] = useState<AdminQueueRow | null>(null);
  const [queueAction, setQueueAction] = useState<string | null>(null);

  const fetchQueues = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await getAdminQueues();
      setQueues(result.queues);
      setTotals(result.totals);
      setRedisAvailable(result.redisAvailable);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load queue status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const hasActiveJobs = (totals?.active ?? 0) > 0;

  useEffect(() => {
    fetchQueues();
    const intervalMs = hasActiveJobs ? 5_000 : 30_000;
    const interval = setInterval(() => fetchQueues(true), intervalMs);
    return () => clearInterval(interval);
  }, [fetchQueues, hasActiveJobs]);

  useEffect(() => {
    if (!exploringQueue) return;
    const updated = queues.find((q) => q.name === exploringQueue.name);
    if (updated) setExploringQueue(updated);
  }, [queues, exploringQueue?.name]);

  const handlePauseResume = async (row: AdminQueueRow) => {
    const isPaused = row.status === "Paused";
    const action = isPaused ? "resume" : "pause";
    if (!window.confirm(`${isPaused ? "Resume" : "Pause"} queue "${row.label}"?`)) return;

    setQueueAction(`${row.name}:pause`);
    try {
      if (isPaused) {
        await resumeAdminQueue(row.name);
        toast.success(`${row.label} resumed`);
      } else {
        await pauseAdminQueue(row.name);
        toast.success(`${row.label} paused`);
      }
      await fetchQueues(true);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${action} queue`);
    } finally {
      setQueueAction(null);
    }
  };

  const handleClearQueue = async (row: AdminQueueRow) => {
    const count = totalJobs(row);
    if (count === 0) {
      toast.info(`${row.label} has no jobs to clear`);
      return;
    }
    if (
      !window.confirm(
        `Clear all jobs from "${row.label}"?\n\nThis removes waiting, active, delayed, failed, and completed jobs (${formatNumber(count)} total). Active jobs may still finish on a running worker until it exits.\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setQueueAction(`${row.name}:clear`);
    try {
      const { removed } = await clearAdminQueue(row.name);
      toast.success(`Cleared ${formatNumber(removed)} jobs from ${row.label}`);
      await fetchQueues(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to clear queue");
    } finally {
      setQueueAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          BullMQ job queues backed by Redis. Refreshes every {hasActiveJobs ? "5" : "30"} seconds
          {hasActiveJobs ? " while jobs are active" : ""}.
        </p>
        <button
          type="button"
          onClick={() => fetchQueues(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm hover:bg-foreground/80 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {!redisAvailable && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <p>
            Could not read one or more queues from Redis. Totals may be incomplete. Check that Redis is
            running and the API can connect.
          </p>
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <AdminStatCard
            label="Waiting"
            value={formatNumber(totals.waiting)}
            hint="Jobs queued"
            icon={Clock}
            iconClassName="text-amber-400"
          />
          <AdminStatCard
            label="Active"
            value={formatNumber(totals.active)}
            hint="In progress"
            icon={Play}
            iconClassName="text-teal-400"
          />
          <AdminStatCard
            label="Delayed"
            value={formatNumber(totals.delayed)}
            hint="Scheduled later"
            icon={Timer}
            iconClassName="text-blue-400"
          />
          <AdminStatCard
            label="Failed"
            value={formatNumber(totals.failed)}
            hint="Retained failures"
            icon={XCircle}
            iconClassName="text-red-400"
          />
          <AdminStatCard
            label="Completed"
            value={formatNumber(totals.completed)}
            hint="Auto-removed on success"
            icon={CheckCircle2}
            iconClassName="text-green-400"
          />
        </div>
      )}

      <div className="bg-foreground rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borders bg-background/50">
                <th className="px-4 py-3 font-semibold text-muted">Queue</th>
                <th className="px-4 py-3 font-semibold text-muted">Status</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Waiting</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Active</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Delayed</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Failed</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Completed</th>
                <th className="px-4 py-3 font-semibold text-muted">Oldest wait</th>
                <th className="px-4 py-3 font-semibold text-muted">Progress</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Concurrency</th>
                <th className="px-4 py-3 font-semibold text-muted w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="size-6 animate-spin inline-block" />
                  </td>
                </tr>
              ) : queues.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted">
                    No queues configured
                  </td>
                </tr>
              ) : (
                queues.map((row) => {
                  const hint = healthHint(row);
                  const activeProgressLabel = formatActiveJobsProgress(row.activeJobs ?? []);
                  const primaryActiveJob = row.activeJobs?.[0];
                  return (
                    <tr
                      key={row.name}
                      className="border-b border-borders/50 hover:bg-background/30"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-primary">{row.label}</p>
                        <p className="text-xs text-muted mt-0.5">{row.description}</p>
                        <p className="text-xs text-muted/70 font-mono mt-0.5">{row.name}</p>
                        {hint && (
                          <p className="text-xs text-muted mt-1 flex items-center gap-1">
                            {row.status === "Unavailable" || row.failed > 0 ? (
                              <AlertTriangle className="size-3 text-amber-400 shrink-0" />
                            ) : row.status === "Paused" ? (
                              <Pause className="size-3 shrink-0" />
                            ) : (
                              <ListOrdered className="size-3 shrink-0" />
                            )}
                            {hint}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-primary">
                        {formatNumber(row.waiting)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-teal-400">
                        {formatNumber(row.active)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatNumber(row.delayed)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-400">
                        {formatNumber(row.failed)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatNumber(row.completed)}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {formatDuration(row.oldestWaitingMs)}
                      </td>
                      <td className="px-4 py-3 min-w-[7rem] max-w-[12rem]">
                        {row.active > 0 ? (
                          <div>
                            {primaryActiveJob && primaryActiveJob.progress != null ? (
                              <JobProgressDisplay progress={primaryActiveJob.progress} />
                            ) : (
                              <span className="text-muted text-xs tabular-nums">{activeProgressLabel ?? "—"}</span>
                            )}
                            {row.activeJobs && row.activeJobs.length > 1 && (
                              <p className="text-xs text-muted/70 mt-1 truncate" title={row.activeJobs.map((j) => j.summary).join(", ")}>
                                +{row.activeJobs.length - 1} more
                              </p>
                            )}
                            {primaryActiveJob?.summary && (
                              <p className="text-xs text-muted mt-1 line-clamp-1" title={primaryActiveJob.summary}>
                                {primaryActiveJob.summary}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {row.concurrency}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {row.status !== "Unavailable" && (
                            <button
                              type="button"
                              onClick={() => handleClearQueue(row)}
                              disabled={queueAction === `${row.name}:clear` || totalJobs(row) === 0}
                              className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-background border border-transparent hover:border-borders transition-colors disabled:opacity-50"
                              aria-label={`Clear ${row.label}`}
                              title="Clear entire queue"
                            >
                              {queueAction === `${row.name}:clear` ? (
                                <Loader2 className="size-5 animate-spin" />
                              ) : (
                                <Trash2 className="size-5" />
                              )}
                            </button>
                          )}
                          {row.status !== "Unavailable" && (
                            <button
                              type="button"
                              onClick={() => handlePauseResume(row)}
                              disabled={queueAction === `${row.name}:pause`}
                              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-background border border-transparent hover:border-borders transition-colors disabled:opacity-50"
                              aria-label={row.status === "Paused" ? `Resume ${row.label}` : `Pause ${row.label}`}
                              title={row.status === "Paused" ? "Resume queue" : "Pause queue"}
                            >
                              {queueAction === `${row.name}:pause` ? (
                                <Loader2 className="size-5 animate-spin" />
                              ) : row.status === "Paused" ? (
                                <Play className="size-5" />
                              ) : (
                                <Pause className="size-5" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setExploringQueue(row)}
                            disabled={row.status === "Unavailable"}
                            className="p-2 rounded-lg text-muted hover:text-primary hover:bg-background border border-transparent hover:border-borders transition-colors disabled:opacity-50"
                            aria-label={`Explore ${row.label}`}
                          >
                            <EllipsisVertical className="size-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {exploringQueue && (
        <QueueExploreModal
          queue={exploringQueue}
          onClose={() => setExploringQueue(null)}
          onQueueUpdated={() => fetchQueues(true)}
        />
      )}
    </div>
  );
}
