"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Search, RefreshCw, Check, Loader2, Trash2, StopCircle, AlertCircle, Eraser, Edit3 } from "lucide-react";
import { adminScraperSearch, adminSetSource, adminTriggerRescan, adminAddSecondaryTitle, adminGetSource, adminClearSource, adminCancelScan, adminDeleteChapters, adminUpdateSeries, type ScraperSourceResult, type ScraperSearchResult } from "@/services/adminMangaService";
import { toast } from "react-toastify";

interface ChapterInfo { id: number; chapterNumber: string; title?: string | null; }

interface MangaMetadata {
  title?: string | null;
  description?: string | null;
  note?: string | null;
  status?: string | null;
  year?: number | null;
  contentRating?: string | null;
  type?: string | null;
  nativeTitle?: string | null;
  romanizedTitle?: string | null;
}

interface AdminMangaEditModalProps {
  mangaId: number;
  mangaTitle: string;
  manga?: MangaMetadata & Record<string, unknown>;
  secondaryTitles?: unknown;
  chapters?: ChapterInfo[];
  currentScraperId?: string | null;
  currentScraperUrl?: string | null;
  isScanActive?: boolean;
  onClose: () => void;
  onSourceSet?: () => void;
  onVariantAdded?: () => void;
  onChaptersDeleted?: () => void;
  onMetadataUpdated?: () => void;
}

function flattenSecondaryTitles(secondaryTitles: unknown): Array<{ lang: string; title: string; type?: string }> {
  if (!secondaryTitles || typeof secondaryTitles !== "object" || Array.isArray(secondaryTitles)) return [];
  const out: Array<{ lang: string; title: string; type?: string }> = [];
  for (const [lang, arr] of Object.entries(secondaryTitles as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const t = item && typeof item === "object" && "title" in item ? (item as { title: string; type?: string }).title : null;
      if (typeof t === "string" && t.trim()) {
        out.push({
          lang,
          title: t.trim(),
          type: (item as { type?: string }).type,
        });
      }
    }
  }
  return out;
}

export default function AdminMangaEditModal({mangaId, mangaTitle, manga, secondaryTitles, chapters = [], currentScraperId, currentScraperUrl, isScanActive, onClose, onSourceSet, onVariantAdded, onChaptersDeleted, onMetadataUpdated}: AdminMangaEditModalProps) {
  const [searchQuery, setSearchQuery] = useState(mangaTitle);
  const [sources, setSources] = useState<ScraperSourceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [settingSource, setSettingSource] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [clearingSource, setClearingSource] = useState(false);
  const [variantTitle, setVariantTitle] = useState("");
  const [variantLang, setVariantLang] = useState("en");
  const [variantType, setVariantType] = useState("official");
  const [addingVariant, setAddingVariant] = useState(false);
  const [source, setSource] = useState<{
    scraperId: string | null;
    scraperUrl: string | null;
    status: string | null;
    errorMessage: string | null;
    scanStatus: string;
    isQueued: boolean;
  } | null>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [deleteSelected, setDeleteSelected] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMetadata, setEditMetadata] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    title: manga?.title ?? "",
    nativeTitle: manga?.nativeTitle ?? "",
    romanizedTitle: manga?.romanizedTitle ?? "",
    description: manga?.description ?? "",
    status: manga?.status ?? "",
    year: manga?.year != null ? String(manga.year) : "",
    contentRating: manga?.contentRating ?? "",
    type: manga?.type ?? "",
    note: manga?.note ?? "",
  });
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [modalPage, setModalPage] = useState<"source" | "chapters">("source");

  // Local state for variants so the modal updates immediately after successful PATCH
  const [variantsList, setVariantsList] = useState(() => flattenSecondaryTitles(secondaryTitles));

  const fetchSource = useCallback(async () => {
    setSourceLoading(true);
    try {
      const res = await adminGetSource(mangaId);
      setSource(res);
    } catch {
      setSource(null);
    } finally {
      setSourceLoading(false);
    }
  }, [mangaId]);

  useEffect(() => {
    fetchSource();
  }, [fetchSource]);

  // Sync local variants if the parent ever provides updated secondaryTitles
  useEffect(() => {
    setVariantsList(flattenSecondaryTitles(secondaryTitles));
  }, [secondaryTitles]);

  useEffect(() => {
    if (manga) {
      setMetadataForm({
        title: manga.title ?? "",
        nativeTitle: manga.nativeTitle ?? "",
        romanizedTitle: manga.romanizedTitle ?? "",
        description: manga.description ?? "",
        status: manga.status ?? "",
        year: manga.year != null ? String(manga.year) : "",
        contentRating: manga.contentRating ?? "",
        type: manga.type ?? "",
        note: manga.note ?? "",
      });
    }
  }, [manga]);

  const displayScraperId = source?.scraperId ?? currentScraperId;
  const displayScraperUrl = source?.scraperUrl ?? currentScraperUrl;

  const runSearch = useCallback(async () => {
    setSearching(true);
    setSources(null);
    try {
      const res = await adminScraperSearch(mangaId, searchQuery.trim() || undefined);
      setSources(res.sources || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [mangaId, searchQuery]);

  const handleSelectSource = async (scraperId: string, scraperUrl: string) => {
    setSettingSource(scraperId);
    try {
      await adminSetSource(mangaId, scraperId, scraperUrl);
      toast.success("Source saved. Click Trigger rescan when you are ready to import chapters.");
      await fetchSource();
      onSourceSet?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set source");
    } finally {
      setSettingSource(null);
    }
  };

  const handleRescan = async () => {
    setRescanning(true);
    try {
      const res = await adminTriggerRescan(mangaId);
      if (res.queued === false) {
        toast.warning(res.message || "Rescan could not be queued. Cancel any stuck scan and try again.");
        return;
      }
      toast.success("Rescan queued. New chapters will be checked.");
      await fetchSource();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue rescan");
    } finally {
      setRescanning(false);
    }
  };

  const handleCancelScan = async () => {
    setCancelling(true);
    try {
      const res = await adminCancelScan(mangaId);
      const msg = res.removed.scanJobRemoved || res.removed.chapterJobsRemoved > 0
        ? `Scan cancelled. Removed ${res.removed.chapterJobsRemoved} chapter job(s).`
        : "No active scan found.";
      toast.success(msg);
      await fetchSource();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel scan");
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteChapters = async () => {
    if (deleteSelected.size === 0) return;
    const deleteAll = deleteSelected.size === chapters.length && chapters.length > 0;
    setDeleting(true);
    try {
      const res = await adminDeleteChapters(mangaId, {
        confirm: true,
        ...(deleteAll ? { deleteAll: true } : { chapterIds: Array.from(deleteSelected) }),
      });
      if (res.storageCleanupQueued) {
        toast.success(`Deleted ${res.deletedCount} chapter(s). Storage cleanup is running in the background.`);
      } else {
        toast.success(`Deleted ${res.deletedCount} chapter(s).`);
      }
      setDeleteSelected(new Set());
      setDeleteConfirmOpen(false);
      onChaptersDeleted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete chapters");
    } finally {
      setDeleting(false);
    }
  };

  const handleClearSource = async () => {
    setClearingSource(true);
    try {
      await adminClearSource(mangaId);
      toast.success("Source cleared. Next scan will re-search.");
      await fetchSource();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear source");
    } finally {
      setClearingSource(false);
    }
  };

  const handleSaveMetadata = async () => {
    setSavingMetadata(true);
    try {
      const updates: Record<string, unknown> = {};
      if (metadataForm.title !== (manga?.title ?? "")) updates.title = metadataForm.title || null;
      if (metadataForm.nativeTitle !== (manga?.nativeTitle ?? "")) updates.nativeTitle = metadataForm.nativeTitle || null;
      if (metadataForm.romanizedTitle !== (manga?.romanizedTitle ?? "")) updates.romanizedTitle = metadataForm.romanizedTitle || null;
      if (metadataForm.description !== (manga?.description ?? "")) updates.description = metadataForm.description || null;
      if (metadataForm.status !== (manga?.status ?? "")) updates.status = metadataForm.status || null;
      const yearVal = metadataForm.year ? parseInt(String(metadataForm.year), 10) : null;
      if (yearVal !== (manga?.year ?? null)) updates.year = yearVal;
      if (metadataForm.contentRating !== (manga?.contentRating ?? "")) updates.contentRating = metadataForm.contentRating || null;
      if (metadataForm.type !== (manga?.type ?? "")) updates.type = metadataForm.type || null;
      const noteVal = metadataForm.note.trim();
      if (noteVal !== (manga?.note ?? "").trim()) updates.note = noteVal || null;
      if (Object.keys(updates).length === 0) {
        setEditMetadata(false);
        return;
      }
      await adminUpdateSeries(mangaId, updates);
      toast.success("Metadata updated.");
      setEditMetadata(false);
      onMetadataUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update metadata");
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleAddVariant = async () => {
    const title = variantTitle.trim();
    if (!title) {
      toast.error("Enter a title");
      return;
    }
    setAddingVariant(true);
    try {
      const res = await adminAddSecondaryTitle(mangaId, {
        title,
        language: variantLang.trim() || "en",
        type: variantType.trim() || "official",
      });
      toast.success("Title variant added.");
      setVariantTitle("");
      if (res?.secondaryTitles) {
        setVariantsList(flattenSecondaryTitles(res.secondaryTitles));
      }
      onVariantAdded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add variant");
    } finally {
      setAddingVariant(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-background border border-borders rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b border-borders px-4 py-3 z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Edit Manga (Admin)</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-md hover:bg-foreground text-muted hover:text-primary"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalPage("source")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${modalPage === "source" ? "bg-accent text-white" : "bg-foreground hover:bg-foreground/80 text-muted"}`}
            >
              Source & Scan
            </button>
            <button
              type="button"
              onClick={() => setModalPage("chapters")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${modalPage === "chapters" ? "bg-accent text-white" : "bg-foreground hover:bg-foreground/80 text-muted"}`}
            >
              Chapters & Metadata
            </button>
          </div>
        </div>

        <div className="p-4">
          {modalPage === "source" && (
          <>
          {/* Scan status */}
          <section className="flex items-center gap-2">
            <h3 className="font-medium text-muted">Scan status</h3>
            {sourceLoading ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <p className="capitalize">
                <span className={
                  source?.scanStatus === "scanning" || source?.scanStatus === "downloading" ? "text-amber-500" :
                  source?.scanStatus === "queued" ? "text-blue-400" :
                  source?.scanStatus === "source_set" ? "text-sky-400" :
                  source?.scanStatus === "failed" ? "text-red-400" :
                  source?.scanStatus === "completed" ? "text-green-400" :
                  "text-muted"
                }>
                  {source?.scanStatus === "source_set" ? "source set (ready to scan)" : (source?.scanStatus ?? "idle")}
                </span>
                {source?.isQueued && " (queued)"}
              </p>
            )}
          </section>

          {/* Current source - always fetched from DB so it shows after match/rescan */}
          <section className="flex items-center gap-2">
            <h3 className="font-medium text-muted">Current source</h3>
            {sourceLoading ? (
              <p className="text-muted">Loading…</p>
            ) : displayScraperId || displayScraperUrl ? (
              <>
              <a href={displayScraperUrl ?? ""} target="_blank" rel="noopener noreferrer">{displayScraperId ?? "—"}</a>
              <button
                type="button"
                onClick={handleClearSource}
                disabled={clearingSource}
                className="inline-flex items-center gap-2 px-2 py-1 text-xs bg-foreground hover:bg-foreground/80 rounded-md disabled:opacity-50 cursor-pointer"
              >
                {clearingSource ? <Loader2 className="size-3 animate-spin" /> : <Eraser className="size-3" />}
                Clear source
              </button>
              </>
            ) : (
              <p className="text-sm text-muted">No source set. Use Match to source below.</p>
            )}
          </section>

          {/* Last scan error */}
          {source?.errorMessage && (
            <section>
              <h3 className="text-sm font-medium text-muted mb-1 flex items-center gap-1">
                <AlertCircle className="size-4 text-red-400" />
                Last scan error
              </h3>
              <p className="text-sm text-red-400/90 bg-red-500/10 rounded-md p-2 wrap-break-words">
                {source.errorMessage}
              </p>
            </section>
          )}

          {/* Match to source: search + carousels */}
          <section>
            <h3 className="text-sm font-medium text-muted my-2">Match to source</h3>
            <div className="flex gap-2 flex-wrap items-center mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search query (default: series title)"
                className="flex-1 min-w-[200px] px-3 py-2 bg-foreground border border-transparent rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/80 disabled:opacity-50"
              >
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Search
              </button>
            </div>
            {sources && (
              <div className="space-y-4">
                {sources.map((src) => (
                  <div key={src.scraperId} className="bg-foreground rounded-md p-3">
                    <h4 className="text-sm font-medium mb-2">{src.scraperName}</h4>
                    {src.results.length === 0 ? (
                      <p className="text-sm text-muted">No results</p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {src.results.map((r: ScraperSearchResult, i: number) => (
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
                                onClick={() => handleSelectSource(src.scraperId, r.href)}
                                disabled={settingSource !== null}
                                className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                {settingSource === src.scraperId ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                                Select
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Title variants */}
          <section>
            <h3 className="text-sm font-medium text-muted mb-2">Title variants</h3>
            {variantsList.length > 0 && (
              <ul className="text-sm mb-3 list-disc list-inside text-muted">
                {variantsList.map((v, i) => (
                  <li key={i}>
                    [{v.lang}] {v.title}
                    {v.type ? ` (${v.type})` : ""}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 items-end">
              <input
                type="text"
                value={variantTitle}
                onChange={(e) => setVariantTitle(e.target.value)}
                placeholder="New title variant"
                className="px-3 py-2 bg-foreground border border-transparent rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent min-w-[180px]"
              />
              <input
                type="text"
                value={variantLang}
                onChange={(e) => setVariantLang(e.target.value)}
                placeholder="Language (e.g. ko, en)"
                className="w-24 px-3 py-2 bg-foreground border border-transparent rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="text"
                value={variantType}
                onChange={(e) => setVariantType(e.target.value)}
                placeholder="Type (e.g. official)"
                className="w-28 px-3 py-2 bg-foreground border border-transparent rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={handleAddVariant}
                disabled={addingVariant}
                className="px-4 py-2 bg-foreground hover:bg-foreground/80 rounded-md text-sm disabled:opacity-50 inline-flex items-center gap-1"
              >
                {addingVariant ? <Loader2 className="size-4 animate-spin" /> : null}
                Add variant
              </button>
            </div>
          </section>

          {/* Rescan */}
          <section>
            <h3 className="text-sm font-medium text-muted my-2">Rescan</h3>
            <p className="text-sm text-muted mb-2">
              Manually trigger a chapter scan for this manga. The scan will use the current source if set.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleRescan}
                disabled={rescanning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-foreground hover:bg-foreground/80 rounded-md disabled:opacity-50"
              >
                {rescanning ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Trigger rescan
              </button>
              <button
                type="button"
                onClick={handleCancelScan}
                disabled={cancelling}
                title={isScanActive ? "Cancel the active scan" : "Remove any queued scan jobs"}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="size-4 animate-spin" /> : <StopCircle className="size-4" />}
                Cancel scan
              </button>
            </div>
          </section>
          </>
          )}

          {modalPage === "chapters" && (
          <>
          {/* Edit series metadata */}
          {manga && (
            <section>
              <h3 className="text-sm font-medium text-muted mb-2 flex items-center gap-1">
                <Edit3 className="size-4" />
                Edit metadata
              </h3>
              {!editMetadata ? (
                <button
                  type="button"
                  onClick={() => setEditMetadata(true)}
                  className="px-4 py-2 bg-foreground hover:bg-foreground/80 rounded-md text-sm"
                >
                  Edit title, description, status…
                </button>
              ) : (
                <div className="space-y-3 bg-foreground/30 rounded-md p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted">Title</label>
                      <input
                        value={metadataForm.title}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, title: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Romanized</label>
                      <input
                        value={metadataForm.romanizedTitle}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, romanizedTitle: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Native</label>
                      <input
                        value={metadataForm.nativeTitle}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, nativeTitle: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Status</label>
                      <input
                        value={metadataForm.status}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, status: e.target.value }))}
                        placeholder="ongoing, completed, …"
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Year</label>
                      <input
                        type="number"
                        value={metadataForm.year}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, year: e.target.value }))}
                        placeholder="2024"
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Type</label>
                      <input
                        value={metadataForm.type}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, type: e.target.value }))}
                        placeholder="manga, manhwa, …"
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Content rating</label>
                      <input
                        value={metadataForm.contentRating}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, contentRating: e.target.value }))}
                        placeholder="safe, suggestive, …"
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Note</label>
                      <input
                        value={metadataForm.note}
                        onChange={(e) => setMetadataForm((f) => ({ ...f, note: e.target.value }))}
                        placeholder="Shown above title on overview"
                        className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted">Description</label>
                    <textarea
                      value={metadataForm.description}
                      onChange={(e) => setMetadataForm((f) => ({ ...f, description: e.target.value }))}
                      rows={4}
                      className="w-full px-3 py-2 bg-background border border-borders rounded-md text-sm resize-y"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditMetadata(false)}
                      disabled={savingMetadata}
                      className="px-4 py-2 bg-foreground/50 hover:bg-foreground/70 rounded-md text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveMetadata}
                      disabled={savingMetadata}
                      className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/80 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {savingMetadata ? <Loader2 className="size-4 animate-spin" /> : null}
                      Save
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Delete Chapters */}
          {chapters.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-muted my-2">Delete chapters</h3>
              <p className="text-sm text-muted mb-2">
                Select chapters to delete. This removes them from the database and storage. Cannot be undone.
              </p>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setDeleteSelected(new Set(chapters.map((ch) => ch.id)))}
                  className="text-xs px-2 py-1 bg-foreground hover:bg-foreground/80 rounded-md"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteSelected(new Set())}
                  className="text-xs px-2 py-1 bg-foreground hover:bg-foreground/80 rounded-md"
                >
                  Deselect all
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-borders rounded-md p-2 bg-foreground/50">
                {chapters.map((ch) => (
                  <label key={ch.id} className="flex items-center gap-2 py-1 hover:bg-foreground/50 rounded px-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteSelected.has(ch.id)}
                      onChange={(e) => {
                        setDeleteSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(ch.id);
                          else next.delete(ch.id);
                          return next;
                        });
                      }}
                      className="rounded"
                    />
                    <span className="text-sm truncate">
                      Ch. {ch.chapterNumber}
                      {ch.title ? ` — ${ch.title}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => deleteSelected.size > 0 && setDeleteConfirmOpen(true)}
                disabled={deleteSelected.size === 0}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md disabled:opacity-50"
              >
                <Trash2 className="size-4" />
                Delete {deleteSelected.size > 0 ? deleteSelected.size : ""} selected
              </button>

              {deleteConfirmOpen && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70" onClick={() => !deleting && setDeleteConfirmOpen(false)}>
                  <div className="bg-background border border-borders rounded-lg p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                    <h4 className="font-semibold mb-2">Confirm delete</h4>
                    <p className="text-sm text-muted mb-4">
                      {deleteSelected.size === chapters.length && chapters.length > 0
                        ? `Delete all ${chapters.length} chapters? The entire series storage folder will be removed. This cannot be undone.`
                        : `Delete ${deleteSelected.size} chapter(s)? This cannot be undone. Storage files will be removed.`}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmOpen(false)}
                        disabled={deleting}
                        className="px-4 py-2 bg-foreground hover:bg-foreground/80 rounded-md"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteChapters}
                        disabled={deleting}
                        className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 inline-flex items-center gap-2"
                      >
                        {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
