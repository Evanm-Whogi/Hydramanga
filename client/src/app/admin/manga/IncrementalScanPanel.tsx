"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "react-toastify";
import { triggerRankedScan } from "@/services/adminScanService";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "oel", label: "OEL" },
  { value: "other", label: "Other" },
];

export default function IncrementalScanPanel() {
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState("100");
  const [skipWithChapters, setSkipWithChapters] = useState(true);
  const [autoSelectSource, setAutoSelectSource] = useState(true);
  const [type, setType] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startNum = Number(start);
    const endNum = Number(end);
    if (!Number.isFinite(startNum) || !Number.isFinite(endNum) || startNum < 1 || endNum < startNum) {
      toast.error("Enter valid ranks (start ≥ 1, end ≥ start)");
      return;
    }
    if (endNum - startNum + 1 > 500) {
      toast.error("Maximum 500 titles per batch");
      return;
    }

    setSubmitting(true);
    try {
      const result = await triggerRankedScan({
        start: startNum,
        end: endNum,
        skipWithChapters,
        autoSelectSource,
        type: type === "all" ? undefined : type,
      });
      toast.success(result.message);
      setStart(String(endNum + 1));
      setEnd(String(endNum + (endNum - startNum + 1)));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to queue ranked scan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-foreground/50 rounded-lg border border-borders/30 p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-primary">Incremental ranked scan</h2>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          Queue chapter scans by global popularity rank (weighted score). Run batches like 1–100, then 101–200. With auto-select on, each title gets a scraper source using the same cross-scraper title match scoring (and scraper priority) as manual source search, then the scan job is queued.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row lg:flex-wrap gap-3 lg:items-end items-center">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Start rank
          <input
            type="number"
            min={1}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-background border border-borders text-primary text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          End rank
          <input
            type="number"
            min={1}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-background border border-borders text-primary text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="min-w-32 px-3 py-2 rounded-lg bg-background border border-borders text-primary text-sm"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoSelectSource}
              onChange={(e) => setAutoSelectSource(e.target.checked)}
              className="rounded border-borders"
            />
            Auto-select scraper source (title match scoring)
          </label>
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={skipWithChapters}
              onChange={(e) => setSkipWithChapters(e.target.checked)}
              className="rounded border-borders"
            />
            Skip titles that already have chapters (ranks stay global)
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Queue batch
        </button>
      </form>
    </section>
  );
}
