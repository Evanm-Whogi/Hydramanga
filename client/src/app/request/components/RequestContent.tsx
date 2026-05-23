"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, X, Loader2, ExternalLink } from "lucide-react";
import { toast } from "react-toastify";
import InputField from "@/components/InputField";
import {createImportRequest, listMyImportRequests, type UserImportRequest,} from "@/services/importRequestService";
import { fetchMangaById, searchMangaByTitle } from "@/services/mangaService";

type LinkedSeries = { id: number; title: string };

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/20 text-amber-400";
    case "in_progress":
      return "bg-teal-500/20 text-teal-400";
    case "completed":
      return "bg-green-500/20 text-green-400";
    case "rejected":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-background text-muted";
  }
}

function RequestForm() {
  const searchParams = useSearchParams();
  const seriesIdParam = searchParams.get("seriesId");
  const titleParam = searchParams.get("title");

  const [title, setTitle] = useState(titleParam ?? "");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedSeries, setLinkedSeries] = useState<LinkedSeries | null>(null);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LinkedSeries[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState<UserImportRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const searchRef = useRef<HTMLDivElement>(null);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const requests = await listMyImportRequests();
      setMyRequests(requests);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (titleParam) setTitle(titleParam);
  }, [titleParam]);

  useEffect(() => {
    const parsed = seriesIdParam ? Number(seriesIdParam) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    if (titleParam) {
      setLinkedSeries({ id: parsed, title: titleParam });
      return;
    }

    fetchMangaById(parsed)
      .then((data) => {
        const mangaTitle = data.manga?.title;
        if (mangaTitle) {
          setLinkedSeries({ id: parsed, title: mangaTitle });
          setTitle((prev) => prev || mangaTitle);
        } else {
          setLinkedSeries({ id: parsed, title: `Manga #${parsed}` });
        }
      })
      .catch(() => {
        setLinkedSeries({ id: parsed, title: `Manga #${parsed}` });
      });
  }, [seriesIdParam, titleParam]);

  useEffect(() => {
    const query = seriesSearch.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchMangaByTitle(query);
        const items = (data.items ?? [])
          .filter((item) => item.title)
          .map((item) => ({ id: item.id, title: item.title as string }));
        setSearchResults(items);
        setSearchOpen(items.length > 0);
      } catch (err) {
        console.error(err);
        setSearchResults([]);
        setSearchOpen(false);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [seriesSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSeries = (series: LinkedSeries) => {
    setLinkedSeries(series);
    setSeriesSearch("");
    setSearchResults([]);
    setSearchOpen(false);
    if (!title.trim()) setTitle(series.title);
  };

  const clearLinkedSeries = () => {
    setLinkedSeries(null);
    setSeriesSearch("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createImportRequest({
        requestedTitle: title.trim(),
        requestedUrl: url.trim() || undefined,
        notes: notes.trim() || undefined,
        seriesId: linkedSeries?.id,
      });
      toast.success("Import request submitted. We'll review it soon.");
      setUrl("");
      setNotes("");
      if (!seriesIdParam) {
        setTitle("");
        clearLinkedSeries();
      }
      await loadRequests();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to submit request";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-row gap-8 mx-auto">
      <div className="bg-foreground p-5 rounded-lg border border-borders w-1/2">
        <p className="text-sm text-muted mb-4">
          Tell us which manga you want imported. Include a source URL if you have one (MAL, AniList, etc.).
          Optionally link an existing page on this site by searching its title.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="rounded-lg bg-background/40 p-4 space-y-3">

            {linkedSeries ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-foreground border border-borders">
                <div className="min-w-0">
                  <p className="font-medium text-primary truncate">{linkedSeries.title}</p>
                  <Link
                    href={`/manga/${linkedSeries.id}`}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    ID {linkedSeries.id}
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={clearLinkedSeries}
                  className="p-2 rounded-lg text-muted hover:text-primary hover:bg-background shrink-0"
                  aria-label="Clear linked manga"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div ref={searchRef} className="flex flex-col gap-1.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Search manga on this site…"
                    value={seriesSearch}
                    onChange={(e) => setSeriesSearch(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-foreground border border-borders text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted animate-spin" />
                  )}
                  {searchOpen && searchResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-borders bg-background shadow-lg">
                      {searchResults.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => selectSeries(item)}
                            className="w-full px-3 py-2 text-left hover:bg-foreground flex items-center justify-between gap-2"
                          >
                            <span className="text-primary truncate">{item.title}</span>
                            <span className="text-xs text-muted shrink-0">#{item.id}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <InputField
            label="Manga title"
            placeholder="e.g. One Piece"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            required
          />
          <InputField
            label="Source URL (MAL, AniList, etc.)"
            placeholder="https://myanimelist.net/manga/..."
            type="url"
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-muted ml-1">Notes (optional)</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferred scan group, language, or other details."
              className="w-full bg-foreground border border-borders text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="self-start px-5 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </div>

      <div className="bg-foreground p-5 rounded-lg border border-borders w-1/2">
        <h2 className="text-lg font-bold text-primary mb-3">Your requests</h2>
        {loadingRequests ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : myRequests.length === 0 ? (
          <p className="text-sm text-muted">You have not submitted any import requests yet.</p>
        ) : (
          <ul className="divide-y divide-borders">
            {myRequests.map((req) => (
              <li key={req.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium text-primary">{req.requestedTitle}</p>
                  {req.seriesId && (
                    <Link
                      href={`/manga/${req.seriesId}`}
                      className="text-xs text-accent hover:underline"
                    >
                      View on site (#{req.seriesId})
                    </Link>
                  )}
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`self-start sm:self-center px-2 py-0.5 rounded text-xs font-medium ${statusClass(req.status)}`}
                >
                  {statusLabel(req.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function RequestContent() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <RequestForm />
    </Suspense>
  );
}
