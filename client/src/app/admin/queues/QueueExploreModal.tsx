"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {X, Loader2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink} from "lucide-react";
import { toast } from "react-toastify";
import { getAdminQueueJobs, type AdminQueueJobRow, type AdminQueueJobState, type AdminQueueRow } from "@/services/adminQueueService";

const STATE_TABS: { value: AdminQueueJobState; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "active", label: "Active" },
  { value: "delayed", label: "Delayed" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
];

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
}

export default function QueueExploreModal({ queue, onClose }: QueueExploreModalProps) {
  const [state, setState] = useState<AdminQueueJobState>("waiting");
  const [jobs, setJobs] = useState<AdminQueueJobRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const countForState = (s: AdminQueueJobState): number => {
    switch (s) {
      case "waiting":
        return queue.waiting;
      case "active":
        return queue.active;
      case "delayed":
        return queue.delayed;
      case "failed":
        return queue.failed;
      case "completed":
        return queue.completed;
    }
  };

  const fetchJobs = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await getAdminQueueJobs(queue.name, { state, page, limit: 25 });
        setJobs(result.jobs);
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
    setPage(1);
    setExpandedId(null);
  }, [state]);

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
              onClick={() => fetchJobs(true)}
              disabled={loading || refreshing}
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

        <div className="flex flex-wrap gap-2 p-4 border-b border-borders shrink-0">
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

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex justify-center py-16 text-muted">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-center text-muted py-16 text-sm">No {state} jobs in this queue</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b border-borders">
                    <th className="px-4 py-2 font-semibold text-muted">Job</th>
                    <th className="px-4 py-2 font-semibold text-muted">Summary</th>
                    <th className="px-4 py-2 font-semibold text-muted">Created</th>
                    <th className="px-4 py-2 font-semibold text-muted">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const expanded = expandedId === job.id;
                    const seriesId = seriesIdFromData(job.data);
                    return (
                      <Fragment key={job.id}>
                        <tr
                          className="border-b border-borders/50 hover:bg-foreground/30 cursor-pointer"
                          onClick={() => setExpandedId(expanded ? null : job.id)}
                        >
                          <td className="px-4 py-2 align-top">
                            <p className="font-mono text-xs text-primary">{job.id}</p>
                            <p className="text-xs text-muted mt-0.5">{job.name}</p>
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
                          <td className="px-4 py-2 align-top text-muted whitespace-nowrap">
                            {formatDateTime(job.createdAt)}
                          </td>
                          <td className="px-4 py-2 align-top text-muted tabular-nums">
                            {job.attemptsMade}/{job.maxAttempts || "—"}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-borders/50 bg-foreground/40">
                            <td colSpan={4} className="px-4 py-3">
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
