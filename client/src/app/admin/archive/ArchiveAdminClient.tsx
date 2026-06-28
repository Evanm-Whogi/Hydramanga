"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, ExternalLink, AlertTriangle, Trash2, Ban, Layers, EyeOff, Recycle, Globe, type LucideIcon } from "lucide-react";
import { toast } from "react-toastify";
import {
  listArchiveJobs,
  retryArchiveJob,
  dismissArchiveJob,
  deleteArchiveJob,
  abandonArchiveTorrent,
  importVolumeFromArchive,
  purgeOrphanedTorrents,
  getScraperEgressStatus,
  rotateScraperEgress,
  type ArchiveJob,
  type ArchiveJobFilter,
  type ScraperEgressStatus,
} from "@/services/adminArchiveService";

const STATUS_TABS: { value: ArchiveJobFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "searching", label: "Searching" },
  { value: "downloading", label: "Downloading" },
  { value: "ingesting", label: "Ingesting" },
  { value: "done", label: "Done" },
  { value: "needs_review", label: "Needs review" },
  { value: "failed", label: "Failed" },
  { value: "dismissed", label: "Dismissed" },
];

function statusClass(status: ArchiveJob["status"]): string {
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
  const [statusFilter, setStatusFilter] = useState<ArchiveJobFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [purging, setPurging] = useState(false);
  const [egress, setEgress] = useState<ScraperEgressStatus | null>(null);
  const [rotating, setRotating] = useState(false);

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

  const fetchEgress = useCallback(async () => {
    try {
      setEgress(await getScraperEgressStatus());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchEgress();
  }, [fetchEgress]);

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await rotateScraperEgress();
      if (res.rotated) {
        toast.success(`Scraper exit IP rotated${res.newIp ? ` → ${res.newIp}` : ""}`);
      } else {
        toast.info(`Rotation not applied${res.reason ? ` (${res.reason})` : ""}`);
      }
      await fetchEgress();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rotate scraper IP");
    } finally {
      setRotating(false);
    }
  };

  /** Run a per-job action with a busy spinner, optional confirm, toast + refresh. */
  const runJobAction = async (jobId: number, action: () => Promise<unknown>, successMsg: string, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(jobId);
    try {
      await action();
      toast.success(successMsg);
      await fetchJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (job: ArchiveJob) => {
    if (!window.confirm(`Delete acquisition job #${job.id}? This removes the job record.`)) return;
    // Binary confirm: offer to also stop seeding + wipe the downloaded files.
    const deleteTorrent = !!job.clientHandle && window.confirm("Also remove the torrent from qBittorrent and delete its downloaded files (stop seeding)?\n\nOK = remove torrent + files · Cancel = keep them.");
    setBusyId(job.id);
    try {
      await deleteArchiveJob(job.id, { deleteTorrent, deleteFiles: deleteTorrent });
      toast.success(deleteTorrent ? "Job deleted; torrent removal queued" : "Job deleted");
      await fetchJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete job");
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm("Remove every torrent in the manga category that has no active job (stops seeding + deletes their files) and sweep stale scratch folders?")) return;
    setPurging(true);
    try {
      await purgeOrphanedTorrents();
      toast.success("Cleanup started on the worker — orphaned torrents and stale folders are being removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start cleanup");
    } finally {
      setPurging(false);
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

      {egress && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-borders bg-foreground p-3 text-sm">
          <div className="flex items-start gap-2">
            <Globe className="size-4 mt-0.5 shrink-0 text-muted" />
            <div>
              <p className="text-primary">
                Scraper egress:{" "}
                {egress.proxyEnabled ? (
                  <span className="text-teal-400">proxied</span>
                ) : (
                  <span className="text-muted">direct (proxy off)</span>
                )}
              </p>
              <p className="text-muted">
                {egress.reachable ? (
                  <>
                    Exit IP <code className="text-primary">{egress.publicIp ?? "—"}</code>
                    {egress.provider ? ` · ${egress.provider}` : ""}
                  </>
                ) : (
                  <span className="text-amber-400">
                    Scraper VPN control unreachable{egress.reason ? `: ${egress.reason}` : ""}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRotate}
            disabled={rotating}
            title="Stop→start the scraper gluetun to pick a new Mullvad exit IP"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-background border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50 self-start"
          >
            {rotating ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Rotate scraper IP
          </button>
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
        <div className="flex gap-2 self-start">
          <button
            type="button"
            onClick={handlePurge}
            disabled={purging}
            title="Stop seeding + delete torrents that have no active job, and sweep stale scratch folders"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-amber-400 hover:bg-foreground/80 disabled:opacity-50"
          >
            {purging ? <Loader2 className="size-4 animate-spin" /> : <Recycle className="size-4" />}
            Purge orphaned torrents
          </button>
          <button
            type="button"
            onClick={() => fetchJobs()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-primary hover:bg-foreground/80 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
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
                <th className="px-4 py-3 font-semibold text-muted text-right">Actions</th>
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
                      {job.status === "downloading" && typeof job.progress === "number" && (
                        <p className="text-xs text-muted mt-1">{Math.round(job.progress * 100)}% downloaded</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-primary">{job.chaptersIngested}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatBytes(job.sizeBytes)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(job.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {busyId === job.id ? (
                          <Loader2 className="size-4 animate-spin text-muted" />
                        ) : (
                          <>
                            {(job.status === "failed" || job.status === "needs_review" || job.status === "downloaded") && (
                              <ActionBtn
                                icon={RotateCcw}
                                label="Retry"
                                disabled={!enabled && !job.hasLocalArchive}
                                title={job.hasLocalArchive ? "Re-run ingest on the downloaded files" : "Re-search and download again"}
                                onClick={() => runJobAction(job.id, () => retryArchiveJob(job.id), "Retry queued")}
                              />
                            )}
                            {job.status === "needs_review" && job.hasLocalArchive && (
                              <ActionBtn
                                icon={Layers}
                                label="Import volume"
                                tone="accent"
                                disabled={!enabled}
                                title="Delete scraped chapters and import the downloaded volume pack instead"
                                onClick={() => runJobAction(job.id, () => importVolumeFromArchive(job.id), "Volume import queued", `Delete this series' existing chapters and import the downloaded volume pack instead?\n\nThe series will be locked to archive-only (the scraper stops touching it).`)}
                              />
                            )}
                            {job.clientHandle && ["searching", "downloading", "downloaded", "needs_review"].includes(job.status) && (
                              <ActionBtn
                                icon={Ban}
                                label="Abandon"
                                title="Stop seeding + delete files, leave the series to the scrapers"
                                onClick={() => runJobAction(job.id, () => abandonArchiveTorrent(job.id), "Torrent abandoned", "Stop seeding + delete this torrent's files and leave the series to the scrapers?")}
                              />
                            )}
                            {!job.dismissedAt && ["done", "failed", "needs_review"].includes(job.status) && (
                              <ActionBtn
                                icon={EyeOff}
                                label="Dismiss"
                                title="Hide this job from the default list"
                                onClick={() => runJobAction(job.id, () => dismissArchiveJob(job.id), "Dismissed")}
                              />
                            )}
                            <ActionBtn icon={Trash2} label="Delete" tone="danger" title="Delete this job record" onClick={() => handleDelete(job)} />
                          </>
                        )}
                      </div>
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

function ActionBtn({ icon: Icon, label, onClick, disabled, tone = "default", title }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "accent";
  title?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-400 hover:bg-red-500/10"
      : tone === "accent"
        ? "text-accent hover:bg-accent/10"
        : "text-primary hover:bg-background";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-foreground border border-borders disabled:opacity-40 ${toneClass}`}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
