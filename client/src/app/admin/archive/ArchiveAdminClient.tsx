"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";
import {
  listArchiveJobs,
  reingestArchive,
  type ArchiveJob,
  type ArchiveJobStatus,
} from "@/services/adminArchiveService";

const STATUS_TABS: { value: ArchiveJobStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "searching", label: "Searching" },
  { value: "downloading", label: "Downloading" },
  { value: "ingesting", label: "Ingesting" },
  { value: "done", label: "Done" },
  { value: "needs_review", label: "Needs review" },
  { value: "failed", label: "Failed" },
];

function statusClass(status: ArchiveJobStatus): string {
  switch (status) {
    case "searching":
    case "downloading":
    case "downloaded":
    case "ingesting":
      return "bg-teal-500/20 text-teal-400";
    case "done":
      return "bg-green-500/20 text-green-400";
    case "needs_review":
      return "bg-amber-500/20 text-amber-400";
    case "failed":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-background text-muted";
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArchiveAdminClient() {
  const [jobs, setJobs] = useState<ArchiveJob[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ArchiveJobStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reingestingId, setReingestingId] = useState<number | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listArchiveJobs({
        page,
        limit: 25,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setJobs(res.jobs);
      setCounts(res.counts);
      setEnabled(res.enabled);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load archive jobs");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleReingest = async (job: ArchiveJob) => {
    setReingestingId(job.id);
    try {
      const res = await reingestArchive(job.seriesId);
      toast.success(res.message || "Re-ingest queued");
      await fetchJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue re-ingest");
    } finally {
      setReingestingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {!enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <p>
            Archive ingestion is currently disabled (<code>ARCHIVE_INGEST_ENABLED=false</code>). Existing jobs are shown
            below, but new imports and re-ingests will be rejected until it is enabled.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map(({ value, label }) => {
            const c = value === "all" ? counts.all : counts[value];
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  statusFilter === value
                    ? "bg-accent text-white border-accent"
                    : "bg-foreground text-muted border-borders hover:text-primary"
                }`}
              >
                {label}
                {typeof c === "number" && <span className="ml-1.5 opacity-70">{c}</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => fetchJobs()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50 self-start"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="text-sm text-muted">{total} acquisition job{total === 1 ? "" : "s"}</p>

      <div className="bg-foreground rounded-lg overflow-hidden border border-borders">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borders bg-background/50">
                <th className="px-4 py-3 font-semibold text-muted">Series</th>
                <th className="px-4 py-3 font-semibold text-muted">Candidate</th>
                <th className="px-4 py-3 font-semibold text-muted">Status</th>
                <th className="px-4 py-3 font-semibold text-muted">Chapters</th>
                <th className="px-4 py-3 font-semibold text-muted">Size</th>
                <th className="px-4 py-3 font-semibold text-muted">Updated</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="size-6 animate-spin inline-block mr-2" />
                    Loading jobs…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    No acquisition jobs found
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="border-b border-borders/50 hover:bg-background/30 transition-colors align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-primary truncate max-w-[200px]">
                        {job.seriesTitle ?? `Series #${job.seriesId}`}
                      </p>
                      <Link
                        href={`/manga/${job.seriesId}`}
                        target="_blank"
                        className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                      >
                        #{job.seriesId} <ExternalLink className="size-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs max-w-[260px]">
                      <p className="truncate" title={job.candidateTitle ?? undefined}>
                        {job.candidateTitle ?? "—"}
                      </p>
                      {job.indexer && <p className="text-muted/60">{job.indexer}</p>}
                      {job.error && (
                        <p className="text-red-400 mt-1 truncate" title={job.error}>
                          {job.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusClass(job.status)}`}>
                        {job.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-primary">{job.chaptersIngested}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatBytes(job.sizeBytes)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(job.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {job.hasLocalArchive && (job.status === "needs_review" || job.status === "failed" || job.status === "done") ? (
                        <button
                          type="button"
                          onClick={() => handleReingest(job)}
                          disabled={reingestingId === job.id || !enabled}
                          title={enabled ? "Re-run ingest on the downloaded files" : "Archive ingestion is disabled"}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-foreground border border-borders text-primary hover:bg-background disabled:opacity-50"
                        >
                          {reingestingId === job.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          Re-ingest
                        </button>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-foreground border border-borders text-primary disabled:opacity-50 hover:bg-foreground/80"
          >
            <ChevronLeft className="size-4" /> Previous
          </button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground border border-borders text-primary disabled:opacity-50 hover:bg-foreground/80"
          >
            Next <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
