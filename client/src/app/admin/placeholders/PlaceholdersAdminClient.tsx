"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Download, Link2, X, Globe2, Check } from "lucide-react";
import { toast } from "react-toastify";
import ThemeCheckbox from "@/components/ThemeCheckbox";
import { dismissPlaceholder, downloadFromPlaceholder, getPlaceholderPages, redownloadPlaceholder, replacePlaceholderPage, type PlaceholderPage } from "@/services/adminScanService";
import { adminScraperSearch, type ScraperSourceResult } from "@/services/adminMangaService";

const REASON_OPTIONS = [
  { value: "http_404", label: "404 (missing page)" },
  { value: "download_failed", label: "Download failed" },
  { value: "known_broken", label: "Known broken graphic" },
  { value: "undecodable", label: "Undecodable" },
  { value: "source_placeholder", label: "Source placeholder" },
  { value: "all", label: "All reasons" },
];

const reasonBadge = (reason: string): string => {
  switch (reason) {
    case "http_404":
      return "bg-amber-500/20 text-amber-400";
    case "download_failed":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-background text-muted";
  }
};

function uniquePrefixes(selected: PlaceholderPage[]): string[] {
  return Array.from(new Set(selected.map((p) => p.storagePrefix)));
}

export default function PlaceholdersAdminClient() {
  const [reason, setReason] = useState("http_404");
  const [pages, setPages] = useState<PlaceholderPage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyPrefix, setBusyPrefix] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<number, string>>({});
  const [downloadFromPageId, setDownloadFromPageId] = useState<number | null>(null);
  const [downloadFromPrefix, setDownloadFromPrefix] = useState<string | null>(null);
  const [downloadFromSeriesId, setDownloadFromSeriesId] = useState<number | null>(null);
  const [sourceCache, setSourceCache] = useState<Record<number, ScraperSourceResult[]>>({});
  const [searchingSeriesId, setSearchingSeriesId] = useState<number | null>(null);
  const [queuingFrom, setQueuingFrom] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOperating, setBulkOperating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPlaceholderPages({ reason, limit: 100 });
      setPages(res.pages);
      setTotal(res.total);
      setUrlDrafts((prev) => {
        const next = { ...prev };
        for (const page of res.pages) {
          if (next[page.id] === undefined) next[page.id] = page.imageUrl ?? "";
        }
        return next;
      });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load placeholders");
    } finally {
      setLoading(false);
    }
  }, [reason]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [reason]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(pages.map((p) => p.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pages]);

  const allSelected = pages.length > 0 && selectedIds.size === pages.length;
  const hasSelection = selectedIds.size > 0;
  const selectedPages = pages.filter((p) => selectedIds.has(p.id));
  const selectedPrefixes = uniquePrefixes(selectedPages);
  const rowBusy = bulkOperating || busyPrefix != null || replacingId != null || dismissingId != null || queuingFrom != null;

  const clearSelection = () => setSelectedIds(new Set());

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pages.map((p) => p.id)));
  };

  const ensureSources = async (seriesId: number) => {
    if (sourceCache[seriesId]) return;
    setSearchingSeriesId(seriesId);
    try {
      const res = await adminScraperSearch(seriesId);
      const ordered = (res.sources || []).slice().sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
      setSourceCache((prev) => ({ ...prev, [seriesId]: ordered }));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Scraper search failed");
    } finally {
      setSearchingSeriesId(null);
    }
  };

  const openDownloadFrom = async (page: PlaceholderPage) => {
    if (downloadFromPageId === page.id) {
      setDownloadFromPageId(null);
      setDownloadFromPrefix(null);
      setDownloadFromSeriesId(null);
      return;
    }
    setDownloadFromPageId(page.id);
    setDownloadFromPrefix(page.storagePrefix);
    setDownloadFromSeriesId(page.seriesId);
    await ensureSources(page.seriesId);
  };

  const handleRedownload = async (storagePrefix: string) => {
    if (!window.confirm(`Redownload ${storagePrefix}? This deletes the chapter's pages and re-fetches it from the pinned source.`)) return;
    setBusyPrefix(storagePrefix);
    try {
      const res = await redownloadPlaceholder(storagePrefix);
      toast.success(res.message);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to queue redownload");
    } finally {
      setBusyPrefix(null);
    }
  };

  const handleReplace = async (page: PlaceholderPage) => {
    const imageUrl = (urlDrafts[page.id] ?? "").trim();
    if (!imageUrl) {
      toast.error("Enter an image URL to replace this page");
      return;
    }
    setReplacingId(page.id);
    try {
      const res = await replacePlaceholderPage({ storagePrefix: page.storagePrefix, pageNumber: page.pageNumber, imageUrl });
      toast.success(res.message);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to replace page");
    } finally {
      setReplacingId(null);
    }
  };

  const handleDismiss = async (page: PlaceholderPage) => {
    if (!window.confirm(`Dismiss ${page.storagePrefix} page ${page.pageNumber}? It will leave the ledger without repairing.`)) return;
    setDismissingId(page.id);
    try {
      const res = await dismissPlaceholder({ storagePrefix: page.storagePrefix, pageNumber: page.pageNumber });
      toast.success(res.message);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to dismiss");
    } finally {
      setDismissingId(null);
    }
  };

  const handleDownloadFrom = async (storagePrefix: string, scraperId: string, scraperUrl: string) => {
    if (!window.confirm(`Download ${storagePrefix} from ${scraperId}? This replaces the chapter images but keeps the series scraper pin.`)) return;
    setQueuingFrom(`${storagePrefix}:${scraperId}:${scraperUrl}`);
    try {
      const res = await downloadFromPlaceholder({ storagePrefix, scraperId, scraperUrl });
      toast.success(res.message);
      setDownloadFromPageId(null);
      setDownloadFromPrefix(null);
      setDownloadFromSeriesId(null);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to queue download from alternate scraper");
    } finally {
      setQueuingFrom(null);
    }
  };

  const runBulkAction = useCallback(async (action: () => Promise<void>, successMessage: string) => {
    if (selectedIds.size === 0 || bulkOperating) return;
    setBulkOperating(true);
    try {
      await action();
      toast.success(successMessage);
      clearSelection();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      await refresh();
      setBulkOperating(false);
    }
  }, [selectedIds.size, bulkOperating, refresh]);

  const handleBulkDismiss = () => {
    const targets = selectedPages;
    if (targets.length === 0) return;
    if (!window.confirm(`Dismiss ${targets.length} selected page(s)? They will leave the ledger without repairing.`)) return;
    void runBulkAction(async () => {
      const results = await Promise.allSettled(
        targets.map((p) => dismissPlaceholder({ storagePrefix: p.storagePrefix, pageNumber: p.pageNumber })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`Dismissed ${targets.length - failed}/${targets.length}; ${failed} failed`);
      }
    }, `Dismissed ${targets.length} page(s)`);
  };

  const handleBulkRedownload = () => {
    const prefixes = selectedPrefixes;
    if (prefixes.length === 0) return;
    if (!window.confirm(`Redownload ${prefixes.length} chapter(s)? This deletes their pages and re-fetches from the pinned source.`)) return;
    void runBulkAction(async () => {
      const results = await Promise.allSettled(prefixes.map((prefix) => redownloadPlaceholder(prefix)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`Queued ${prefixes.length - failed}/${prefixes.length}; ${failed} failed`);
      }
    }, `Queued redownload for ${prefixes.length} chapter(s)`);
  };

  const sourcesForPanel = downloadFromSeriesId != null ? sourceCache[downloadFromSeriesId] : undefined;
  const searchingPanel = downloadFromSeriesId != null && searchingSeriesId === downloadFromSeriesId;

  return (
    <div className={`space-y-4 ${hasSelection ? "pb-24" : ""}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <p className="text-sm text-muted max-w-3xl">
          Durable ledger of pages that got a placeholder (404 / known-broken / undecodable) or failed to download. Replace a single page with a custom image URL, redownload from the pinned source, download the chapter from a different scraper match (pin unchanged), or dismiss without repairing. Select rows for bulk dismiss / redownload.
        </p>
        <span className="inline-flex shrink-0 self-start px-2.5 py-1 rounded-full text-xs font-medium bg-foreground border border-borders text-muted">
          {total} unresolved
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="px-3 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm"
        >
          {REASON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || bulkOperating}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground border border-borders text-primary text-sm font-medium hover:bg-background disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </button>
      </div>

      <div className="bg-foreground rounded-lg overflow-hidden border border-borders">
        {loading && pages.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-12 text-sm text-muted justify-center">
            <Loader2 className="size-5 animate-spin" />
            Loading…
          </div>
        ) : pages.length === 0 ? (
          <p className="px-4 py-12 text-sm text-muted text-center">No unresolved pages for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-borders bg-background/50">
                  <th className="w-10 px-4 py-3">
                    <ThemeCheckbox
                      checked={allSelected}
                      indeterminate={hasSelection && !allSelected}
                      onCheckedChange={toggleAll}
                      disabled={rowBusy}
                      ariaLabel="Select all placeholder pages"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold text-muted">Chapter (prefix)</th>
                  <th className="px-4 py-3 font-semibold text-muted">Page</th>
                  <th className="px-4 py-3 font-semibold text-muted">Reason</th>
                  <th className="px-4 py-3 font-semibold text-muted">HTTP</th>
                  <th className="px-4 py-3 font-semibold text-muted">Scraper</th>
                  <th className="px-4 py-3 font-semibold text-muted">Error</th>
                  <th className="px-4 py-3 font-semibold text-muted">When</th>
                  <th className="px-4 py-3 font-semibold text-muted min-w-[220px]">Replace URL</th>
                  <th className="px-4 py-3 font-semibold text-muted w-44" />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                  <Fragment key={p.id}>
                    <tr className={`border-b border-borders/50 transition-colors ${isSelected ? "bg-background/60" : "hover:bg-background/30"}`}>
                      <td className="px-4 py-3">
                        <ThemeCheckbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(p.id)}
                          disabled={rowBusy}
                          ariaLabel={`Select ${p.storagePrefix} page ${p.pageNumber}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/manga/${p.seriesId}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {p.storagePrefix}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-primary">{p.pageNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${reasonBadge(p.reason)}`}>{p.reason}</span>
                      </td>
                      <td className="px-4 py-3 text-muted">{p.httpStatus ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{p.scraperId ?? "—"}</td>
                      <td className="px-4 py-3 text-muted max-w-xs truncate" title={p.errorMessage ?? undefined}>{p.errorMessage ?? "—"}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <input
                          type="url"
                          value={urlDrafts[p.id] ?? ""}
                          onChange={(e) => setUrlDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder={p.imageUrl ?? "https://…"}
                          disabled={bulkOperating}
                          className="w-full min-w-[200px] px-2.5 py-1.5 rounded-lg bg-background border border-borders text-primary text-xs placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleReplace(p)}
                            disabled={rowBusy || replacingId === p.id}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {replacingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRedownload(p.storagePrefix)}
                            disabled={rowBusy || busyPrefix === p.storagePrefix}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground border border-borders text-primary text-xs font-medium hover:bg-background disabled:opacity-50"
                          >
                            {busyPrefix === p.storagePrefix ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                            Redownload
                          </button>
                          <button
                            type="button"
                            onClick={() => void openDownloadFrom(p)}
                            disabled={bulkOperating}
                            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 ${
                              downloadFromPageId === p.id
                                ? "bg-accent/15 border-accent text-accent"
                                : "bg-foreground border-borders text-primary hover:bg-background"
                            }`}
                          >
                            <Globe2 className="size-3.5" />
                            Download from…
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDismiss(p)}
                            disabled={rowBusy || dismissingId === p.id}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground border border-borders text-muted text-xs font-medium hover:bg-background hover:text-primary disabled:opacity-50"
                          >
                            {dismissingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                            Dismiss
                          </button>
                        </div>
                      </td>
                    </tr>
                    {downloadFromPageId === p.id && downloadFromPrefix === p.storagePrefix && (
                      <tr className="border-b border-borders/50 bg-background/40">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm text-primary font-medium">
                                Download {p.storagePrefix} from another scraper
                                <span className="ml-2 text-xs font-normal text-muted">(series pin stays unchanged)</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => { setDownloadFromPageId(null); setDownloadFromPrefix(null); setDownloadFromSeriesId(null); }}
                                className="text-xs text-muted hover:text-primary"
                              >
                                Close
                              </button>
                            </div>
                            {searchingPanel ? (
                              <div className="flex items-center gap-2 text-sm text-muted">
                                <Loader2 className="size-4 animate-spin" />
                                Searching scrapers…
                              </div>
                            ) : !sourcesForPanel ? (
                              <p className="text-sm text-muted">No search results yet.</p>
                            ) : (
                              <div className="space-y-3">
                                {sourcesForPanel.map((src) => (
                                  <div key={src.scraperId} className="rounded-md border border-borders bg-foreground p-3">
                                    <h4 className="text-sm font-medium mb-2">{src.scraperName}</h4>
                                    {src.summary && !src.error && (
                                      <p className="text-xs text-muted mb-2 wrap-break-words">{src.summary}</p>
                                    )}
                                    {src.results.length === 0 ? (
                                      src.error ? (
                                        <p className="text-sm text-red-400/90 bg-red-500/10 rounded-md p-2 wrap-break-words">{src.error}</p>
                                      ) : !src.summary ? (
                                        <p className="text-sm text-muted">No results</p>
                                      ) : null
                                    ) : (
                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                        {src.results.map((r, i) => {
                                          const busyKey = `${p.storagePrefix}:${src.scraperId}:${r.href}`;
                                          const busy = queuingFrom === busyKey;
                                          return (
                                            <div
                                              key={`${src.scraperId}-${i}`}
                                              className="shrink-0 w-48 p-3 rounded border border-borders bg-background"
                                            >
                                              <p className="text-sm font-medium truncate" title={r.title}>{r.title}</p>
                                              <p className="text-xs text-muted">Score: {r.score}</p>
                                              <div className="mt-2 flex gap-2">
                                                <a
                                                  href={r.href}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-xs text-accent hover:underline"
                                                >
                                                  Open
                                                </a>
                                                <button
                                                  type="button"
                                                  onClick={() => void handleDownloadFrom(p.storagePrefix, src.scraperId, r.href)}
                                                  disabled={queuingFrom != null || bulkOperating}
                                                  className="text-xs px-2 py-1 bg-accent text-white rounded hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                  {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                                  Use
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
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

      {hasSelection ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-borders bg-background/95 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <div className="container mx-auto flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-sm text-muted">
              {selectedIds.size} page{selectedIds.size === 1 ? "" : "s"}
              {selectedPrefixes.length !== selectedIds.size ? ` · ${selectedPrefixes.length} chapter${selectedPrefixes.length === 1 ? "" : "s"}` : ""}
            </span>
            <button
              type="button"
              onClick={handleBulkRedownload}
              disabled={bulkOperating}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {bulkOperating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-3.5" />}
              Redownload
            </button>
            <button
              type="button"
              onClick={handleBulkDismiss}
              disabled={bulkOperating}
              className="inline-flex items-center gap-1.5 rounded-md border border-borders px-3 py-1.5 text-sm text-muted hover:bg-foreground hover:text-primary disabled:opacity-50"
            >
              <X className="size-3.5" /> Dismiss
            </button>
            <button type="button" onClick={clearSelection} disabled={bulkOperating} className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-primary disabled:opacity-50">
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
