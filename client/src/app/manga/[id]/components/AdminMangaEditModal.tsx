"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Search, RefreshCw, Check, Loader2 } from "lucide-react";
import { adminScraperSearch, adminSetSource, adminTriggerRescan, adminAddSecondaryTitle, type ScraperSourceResult, type ScraperSearchResult } from "@/services/adminMangaService";
import { toast } from "react-toastify";

interface AdminMangaEditModalProps { mangaId: number; mangaTitle: string; secondaryTitles?: unknown; currentScraperId?: string | null; currentScraperUrl?: string | null; onClose: () => void; onSourceSet?: () => void; onVariantAdded?: () => void;}

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

export default function AdminMangaEditModal({mangaId, mangaTitle, secondaryTitles, currentScraperId, currentScraperUrl, onClose, onSourceSet, onVariantAdded}: AdminMangaEditModalProps) {
  const [searchQuery, setSearchQuery] = useState(mangaTitle);
  const [sources, setSources] = useState<ScraperSourceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [settingSource, setSettingSource] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [variantTitle, setVariantTitle] = useState("");
  const [variantLang, setVariantLang] = useState("en");
  const [variantType, setVariantType] = useState("official");
  const [addingVariant, setAddingVariant] = useState(false);

  // Local state for variants so the modal updates immediately after successful PATCH
  const [variantsList, setVariantsList] = useState(() => flattenSecondaryTitles(secondaryTitles));

  // Sync local variants if the parent ever provides updated secondaryTitles
  useEffect(() => {
    setVariantsList(flattenSecondaryTitles(secondaryTitles));
  }, [secondaryTitles]);

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
      toast.success("Source set. Next scan will use this source.");
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
      await adminTriggerRescan(mangaId);
      toast.success("Rescan queued. New chapters will be checked.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue rescan");
    } finally {
      setRescanning(false);
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
        <div className="sticky top-0 bg-background border-b border-borders px-4 py-3 flex items-center justify-between">
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

        <div className="p-4 space-y-6">
          {/* Current source */}
          {(currentScraperId || currentScraperUrl) && (
            <section>
              <h3 className="text-sm font-medium text-muted mb-1">Current source</h3>
              <p className="text-sm">
                <span className="font-mono">{currentScraperId ?? "—"}</span>
                {currentScraperUrl && (
                  <a
                    href={currentScraperUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-accent hover:underline truncate block"
                  >
                    {currentScraperUrl}
                  </a>
                )}
              </p>
            </section>
          )}

          {/* Match to source: search + carousels */}
          <section>
            <h3 className="text-sm font-medium text-muted mb-2">Match to source</h3>
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
            <h3 className="text-sm font-medium text-muted mb-2">Rescan</h3>
            <p className="text-sm text-muted mb-2">
              Manually trigger a chapter scan for this manga. The scan will use the current source if set.
            </p>
            <button
              type="button"
              onClick={handleRescan}
              disabled={rescanning}
              className="inline-flex items-center gap-2 px-4 py-2 bg-foreground hover:bg-foreground/80 rounded-md disabled:opacity-50"
            >
              {rescanning ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Trigger rescan
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
