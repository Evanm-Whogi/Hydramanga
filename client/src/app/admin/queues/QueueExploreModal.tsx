"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {X, Loader2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, RotateCcw, Trash2, FastForward, OctagonX} from "lucide-react";
import { toast } from "react-toastify";
import { getAdminQueueJobs, retryAdminQueueJob, promoteAdminQueueJob, removeAdminQueueJob, clearAdminQueue, type AdminQueueJobCounts, type AdminQueueJobRow, type AdminQueueJobState, type AdminQueueRow } from "@/services/adminQueueService";
import JobProgressDisplay from "./JobProgressDisplay";

const STATE_TABS: { value: AdminQueueJobState; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "active", label: "Active" },
  { value: "delayed", label: "Delayed" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
];

const EMPTY_COUNTS: AdminQueueJobCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateTabClass(active: boolean): string {
  return `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
    active
      ? "bg-accent text-white border-accent"
      : "bg-foreground text-muted border-borders hover:text-primary"
  }`;
}

interface QueueExploreModalProps {
  queue: AdminQueueRow;
  onClose: () => void;
  onQueueUpdated?: () => void;
}

export default function QueueExploreModal({ queue, onClose, onQueueUpdated }: QueueExploreModalProps) {
  const [state, setState] = useState<AdminQueueJobState>(queue.active > 0 ? "active" : "waiting");
  const [jobs, setJobs] = useState<AdminQueueJobRow[]>([]);
  const [counts, setCounts] = useState<AdminQueueJobCounts>(EMPTY_COUNTS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [clearing, setClearing] = useState<"state" | "all" | null>(null);

  const countForState = (s: AdminQueueJobState): number => counts[s];

  const stateLabel = STATE_TABS.find((tab) => tab.value === state)?.label ?? state;
  const stateCount = countForState(state);
  const totalInQueue = counts.waiting + counts.active + counts.delayed + counts.failed + counts.completed;

  const handleClearState = async () => {
    if (stateCount === 0) {
      toast.info(`No ${stateLabel.toLowerCase()} jobs to clear`);
      return;
    }
    const activeWarning =
      state === "active"
        ? " Active jobs may still finish on a running worker until it exits."
        : "";
    if (
      !window.confirm(
        `Clear all ${stateCount} ${stateLabel.toLowerCase()} jobs from "${queue.label}"?${activeWarning}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setClearing("state");
    try {
      const { removed } = await clearAdminQueue(queue.name, state);
      toast.success(`Cleared ${removed} ${stateLabel.toLowerCase()} job${removed !== 1 ? "s" : ""}`);
      await fetchJobs(true);
      onQueueUpdated?.();
    } catch (err) {
      console.error(err);
      toast.error(`Failed to clear ${stateLabel.toLowerCase()} jobs`);
    } finally {
      setClearing(null);
    }
  };

  const handleClearAll = async () => {
    if (totalInQueue === 0) {
      toast.info(`${queue.label} has no jobs to clear`);
      return;
    }
    if (
      !window.confirm(
        `Clear all jobs from "${queue.label}"?\n\nThis removes waiting, active, delayed, failed, and completed jobs (${totalInQueue} total). Active jobs may still finish on a running worker until it exits.\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setClearing("all");
    try {
      const { removed } = await clearAdminQueue(queue.name);
      toast.success(`Cleared ${removed} jobs from ${queue.label}`);
      await fetchJobs(true);
      onQueueUpdated?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to clear queue");
    } finally {
      setClearing(null);
    }
  };

  const fetchJobs = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await getAdminQueueJobs(queue.name, { state, page, limit: 25 });
        setJobs(result.jobs);
        setCounts(result.counts ?? EMPTY_COUNTS);
        setTotalPages(result.pagination.totalPages);
        setTotal(result.pagination.total);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load queue jobs");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [queue.name, state, page]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (queue.active <= 0) return;
    const interval = setInterval(() => fetchJobs(true), 3000);
    return () => clearInterval(interval);
  }, [queue.active, fetchJobs]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [state]);

  const runJobAction = async (
    jobId: string,
    action: "retry" | "promote" | "remove" | "forceRemove",
    confirmMessage?: string,
    opts?: { force?: boolean }
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setActionJobId(jobId);
    try {
      if (action === "retry") {
        await retryAdminQueueJob(queue.name, jobId);
        toast.success("Job queued for retry");
      } else if (action === "promote") {
        await promoteAdminQueueJob(queue.name, jobId);
        toast.success("Job promoted to waiting");
      } else if (action === "forceRemove") {
        await removeAdminQueueJob(queue.name, jobId, { force: true });
        toast.success("Job force-cancelled");
      } else {
        await removeAdminQueueJob(queue.name, jobId, opts?.force ? { force: true } : undefined);
        toast.success(opts?.force ? "Job force-cancelled" : "Job removed");
      }
      await fetchJobs(true);
      onQueueUpdated?.();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionJobId(null);
    }
  };

  const seriesIdFromData = (data: Record<string, unknown>): number | null => {
    const id = data.seriesId;
    if (typeof id === "number" && id > 0) return id;
    if (typeof id === "string" && Number.isFinite(Number(id))) return Number(id);
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-background border border-borders rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-borders shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-primary">{queue.label}</h2>
            <p className="text-sm text-muted">{queue.description}</p>
            <p className="text-xs text-muted/70 font-mono mt-0.5">{queue.name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={loading || clearing !== null || totalInQueue === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-red-400 hover:bg-foreground border border-borders disabled:opacity-50"
              title="Clear entire queue"
            >
              {clearing === "all" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear all
            </button>
            <button
              type="button"
              onClick={() => fetchJobs(true)}
              disabled={loading || refreshing || clearing !== null}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-foreground border border-borders disabled:opacity-50"
              aria-label="Refresh jobs"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-borders shrink-0">
          <div className="flex flex-wrap gap-2">
            {STATE_TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setState(value)}
                className={stateTabClass(state === value)}
              >
                {label}
                <span className="ml-1.5 opacity-80 tabular-nums">({countForState(value)})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {queue.active > 0 && (
              <p className="text-xs text-muted hidden sm:block">Auto-refreshes every 3s while jobs are active</p>
            )}
            <button
              type="button"
              onClick={handleClearState}
              disabled={loading || clearing !== null || stateCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-red-400 hover:bg-foreground border border-borders disabled:opacity-50"
              title={`Clear all ${stateLabel.toLowerCase()} jobs`}
            >
              {clearing === "state" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear {stateLabel.toLowerCase()}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex justify-center py-16 text-muted">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-center text-muted py-16 text-sm">
              No {state} jobs in this queue
              {state === "completed" && (
                <span className="block mt-2 text-xs">
                  Completed jobs are removed from Redis automatically after success.
                </span>
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b border-borders">
                    <th className="px-4 py-2 font-semibold text-muted">Job</th>
                    <th className="px-4 py-2 font-semibold text-muted">Summary</th>
                    <th className="px-4 py-2 font-semibold text-muted text-right">Progress</th>
                    <th className="px-4 py-2 font-semibold text-muted">Created</th>
                    <th className="px-4 py-2 font-semibold text-muted">Attempts</th>
                    <th className="px-4 py-2 font-semibold text-muted w-28">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const expanded = expandedId === job.id;
                    const seriesId = seriesIdFromData(job.data);
                    const busy = actionJobId === job.id;
                    const canRetry = job.state === "failed" || state === "failed";
                    const canPromote = job.state === "delayed" || state === "delayed";
                    const canForceRemove = job.state === "active" || state === "active";
                    return (
                      <Fragment key={job.id}>
                        <tr
                          className="border-b border-borders/50 hover:bg-foreground/30 cursor-pointer"
                          onClick={() => setExpandedId(expanded ? null : job.id)}
                        >
                          <td className="px-4 py-2 align-top">
                            <p className="font-mono text-xs text-primary">{job.id}</p>
                            <p className="text-xs text-muted mt-0.5">{job.name}</p>
                            <p className="text-xs text-muted/70 mt-0.5">{job.state}</p>
                          </td>
                          <td className="px-4 py-2 align-top text-primary max-w-xs">
                            <p className="line-clamp-2">{job.summary}</p>
                            {job.failedReason && (
                              <p className="text-xs text-red-400 mt-1 line-clamp-2">{job.failedReason}</p>
                            )}
                            {seriesId && (
                              <Link
                                href={`/manga/${seriesId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-1"
                              >
                                Manga #{seriesId}
                                <ExternalLink className="size-3" />
                              </Link>
                            )}
                          </td>
                          <td className="px-4 py-2 align-top text-right min-w-[5.5rem]">
                            <JobProgressDisplay progress={job.progress} />
                          </td>
                          <td className="px-4 py-2 align-top text-muted whitespace-nowrap">
                            {formatDateTime(job.createdAt)}
                          </td>
                          <td className="px-4 py-2 align-top text-muted tabular-nums">
                            {job.attemptsMade}/{job.maxAttempts}
                          </td>
                          <td className="px-4 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {canRetry && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Retry job"
                                  onClick={() => runJobAction(job.id, "retry")}
                                  className="p-1.5 rounded text-muted hover:text-teal-400 hover:bg-foreground disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="size-4" />
                                  )}
                                </button>
                              )}
                              {canPromote && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Promote to waiting"
                                  onClick={() => runJobAction(job.id, "promote")}
                                  className="p-1.5 rounded text-muted hover:text-blue-400 hover:bg-foreground disabled:opacity-50"
                                >
                                  <FastForward className="size-4" />
                                </button>
                              )}
                              {canForceRemove && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Force cancel (clears worker lock)"
                                  onClick={() =>
                                    runJobAction(
                                      job.id,
                                      "forceRemove",
                                      `Force-cancel job ${job.id}? Use this when the job is stuck active or locked by a dead worker. A running worker process may still finish its current work until it exits.`
                                    )
                                  }
                                  className="p-1.5 rounded text-muted hover:text-orange-400 hover:bg-foreground disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <OctagonX className="size-4" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                title={canForceRemove ? "Remove job (may fail if locked)" : "Remove job"}
                                onClick={() =>
                                  runJobAction(
                                    job.id,
                                    "remove",
                                    canForceRemove
                                      ? `Force-cancel job ${job.id}? Clears the worker lock if the job is stuck active.`
                                      : `Remove job ${job.id}? This cannot be undone.`,
                                    canForceRemove ? { force: true } : undefined
                                  )
                                }
                                className="p-1.5 rounded text-muted hover:text-red-400 hover:bg-foreground disabled:opacity-50"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-borders/50 bg-foreground/40">
                            <td colSpan={6} className="px-4 py-3">
                              <pre className="text-xs text-muted overflow-x-auto max-h-48 whitespace-pre-wrap break-all font-mono">
                                {JSON.stringify(job.data, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 p-4 border-t border-borders shrink-0">
          <p className="text-sm text-muted">
            {total} job{total !== 1 ? "s" : ""} ({state})
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-lg border border-borders text-primary disabled:opacity-50 hover:bg-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm text-muted tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded-lg border border-borders text-primary disabled:opacity-50 hover:bg-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
