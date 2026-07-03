"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, RotateCcw, OctagonX } from "lucide-react";
import { toast } from "react-toastify";
import {getCatalogScanState, startCatalogScan, stopCatalogScan, forceStopCatalogScan, resetCatalogScan, type CatalogScanState } from "@/services/adminScanService";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "oel", label: "OEL" },
  { value: "other", label: "Other" },
];

const BATCH_SIZE_OPTIONS = [25, 50, 100];

function statusLabel(status: CatalogScanState["status"]): string {
  switch (status) {
    case "running":
      return "Running";
    case "stopping":
      return "Stopping after batch…";
    case "completed":
      return "Completed";
    default:
      return "Idle";
  }
}

function statusClass(status: CatalogScanState["status"]): string {
  switch (status) {
    case "running":
      return "bg-teal-500/20 text-teal-400";
    case "stopping":
      return "bg-amber-500/20 text-amber-400";
    case "completed":
      return "bg-green-500/20 text-green-400";
    default:
      return "bg-background text-muted";
  }
}

export default function CatalogScanPanel() {
  const [state, setState] = useState<CatalogScanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [skipWithChapters, setSkipWithChapters] = useState(true);
  const [autoSelectSource, setAutoSelectSource] = useState(true);
  const [useArchive, setUseArchive] = useState(true);
  const [type, setType] = useState("all");
  const formSyncedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getCatalogScanState();
      const active = next.status === "running" || next.status === "stopping";
      if (!formSyncedRef.current || active) {
        setBatchSize(next.batchSize);
        setSkipWithChapters(next.skipWithChapters);
        setAutoSelectSource(next.autoSelectSource);
        setUseArchive(next.useArchive);
        setType(next.type ?? "all");
        formSyncedRef.current = true;
      }
      setState(next);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const active = state?.status === "running" || state?.status === "stopping";
    const intervalMs = active ? 5000 : 30000;
    const id = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [state?.status, refresh]);

  const isActive = state?.status === "running" || state?.status === "stopping";
  const canResume = !isActive && (state?.nextRank ?? 1) > 1 && state?.status !== "completed";

  const buildStartParams = (resume: boolean) => ({
    batchSize,
    skipWithChapters,
    autoSelectSource,
    useArchive,
    type: type === "all" ? undefined : type,
    resume,
  });

  const handleStart = async (resume: boolean) => {
    if (!resume && canResume) {
      const ok = window.confirm(
        `You have a saved position at rank ${state?.nextRank}. Start over from rank 1, or cancel and use Resume instead?`
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const result = await startCatalogScan(buildStartParams(resume));
      setState(result.state);
      toast.success(resume ? "Catalog scan resumed" : "Catalog scan started");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to start catalog scan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async () => {
    setSubmitting(true);
    try {
      const result = await stopCatalogScan();
      setState(result.state);
      toast.info("Stop requested — current batch will finish first");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to stop catalog scan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceStop = async () => {
    if (!window.confirm("Force stop now? The current batch is discarded without waiting for its jobs to finish. Your cursor is preserved so you can Resume later.")) return;
    setSubmitting(true);
    try {
      const result = await forceStopCatalogScan();
      setState(result.state);
      toast.success("Catalog scan force-stopped");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to force-stop catalog scan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset catalog scan cursor to rank 1 and clear stats?")) return;
    setSubmitting(true);
    try {
      const result = await resetCatalogScan();
      setState(result.state);
      toast.success("Catalog scan reset");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to reset catalog scan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="w-full bg-foreground/50 rounded-lg border border-borders/30 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-primary">Full catalog scan</h2>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            Automatically scan the entire catalog by popularity rank (weighted score), from rank 1 through the end. The coordinator enqueues batches, waits for each batch to finish scanning/downloading, then continues. Stop preserves your cursor and finishes the current batch first; Force stop discards the current batch immediately (use it if you manually cancelled its queue jobs and the scan is stuck). With a type filter, ranks are within that type only (not global).
          </p>
        </div>
        {state && (
          <span className={`inline-flex self-start px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(state.status)}`}>
            {statusLabel(state.status)}
          </span>
        )}
      </div>

      {loading && !state ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          Loading scan state…
        </div>
      ) : state ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted">
              <span>
                Rank {Math.max(1, state.nextRank - 1)} / {state.totalCatalogCount || "?"}
                {state.type ? ` (${state.type})` : ""}
              </span>
              <span>{state.progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-background border border-borders/40 overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${state.progressPercent}%` }}
              />
            </div>
          </div>

          {state.currentBatchStart != null && (
            <p className="text-xs text-muted">
              Current batch: ranks {state.currentBatchStart}–{state.currentBatchEnd} — {state.currentBatchCompleted}/{state.currentBatchTotal} titles done
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg bg-background/60 border border-borders/30 px-3 py-2">
              <div className="text-muted">Queued</div>
              <div className="text-primary font-medium">{state.stats.queued}</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-borders/30 px-3 py-2">
              <div className="text-muted">Archived</div>
              <div className="text-primary font-medium">{state.stats.archived}</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-borders/30 px-3 py-2">
              <div className="text-muted">Skipped</div>
              <div className="text-primary font-medium">{state.stats.skippedWithChapters + state.stats.skippedIgnored}</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-borders/30 px-3 py-2">
              <div className="text-muted">Batches</div>
              <div className="text-primary font-medium">{state.stats.batchesCompleted}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Batch size
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isActive}
              className="w-full px-3 py-2 rounded-lg bg-background border border-borders text-primary text-sm disabled:opacity-50"
            >
              {BATCH_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={isActive}
              className="w-full px-3 py-2 rounded-lg bg-background border border-borders text-primary text-sm disabled:opacity-50"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={useArchive}
              onChange={(e) => setUseArchive(e.target.checked)}
              disabled={isActive}
              className="rounded border-borders disabled:opacity-50"
            />
            Use torrent archive backfill
          </label>
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoSelectSource}
              onChange={(e) => setAutoSelectSource(e.target.checked)}
              disabled={isActive}
              className="rounded border-borders disabled:opacity-50"
            />
            Auto-select scraper source
          </label>
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={skipWithChapters}
              onChange={(e) => setSkipWithChapters(e.target.checked)}
              disabled={isActive}
              className="rounded border-borders disabled:opacity-50"
            />
            Skip titles that already have chapters
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleStart(false)}
            disabled={submitting || isActive}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Start from 1
          </button>
          {canResume && (
            <button
              type="button"
              onClick={() => void handleStart(true)}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              Resume at {state?.nextRank}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={submitting || !isActive}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm font-medium hover:bg-background disabled:opacity-50"
          >
            <Square className="size-4" />
            Stop
          </button>
          <button
            type="button"
            onClick={() => void handleForceStop()}
            disabled={submitting || !isActive}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/20 disabled:opacity-50"
          >
            <OctagonX className="size-4" />
            Force stop
          </button>
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={submitting || isActive}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-foreground border border-borders text-muted text-sm font-medium hover:bg-background disabled:opacity-50"
          >
            <RotateCcw className="size-4" />
            Reset
          </button>
        </div>
      </div>

      {state?.updatedAt && (
        <p className="text-xs text-muted">Last updated {new Date(state.updatedAt).toLocaleString()}</p>
      )}
    </section>
  );
}
