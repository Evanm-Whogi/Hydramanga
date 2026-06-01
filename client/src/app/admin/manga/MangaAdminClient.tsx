"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {Search, ChevronLeft, ChevronRight, Loader2, EllipsisVertical, ExternalLink} from "lucide-react";
import { toast } from "react-toastify";
import { listAdminManga, listAdminMangaScraperFilters, listAdminMangaTypeFilters, fetchMangaForAdminEdit, type AdminMangaListItem, type ListAdminMangaParams, type AdminMangaScraperFilterOption, type AdminMangaTypeFilterOption } from "@/services/adminMangaListService";
import { adminGetSource } from "@/services/adminMangaService";
import { getCoverUrl } from "@/lib/historyUtils";
import AdminMangaEditModal from "@/app/manga/[id]/components/AdminMangaEditModal";

const STATUS_FILTERS: { value: ListAdminMangaParams["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scanning", label: "Scanning" },
  { value: "downloading", label: "Downloading" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "none", label: "Not Imported" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function importStatusClass(status: string | null): string {
  switch (status) {
    case "scanning":
    case "downloading":
      return "bg-teal-500/20 text-teal-400";
    case "completed":
      return "bg-green-500/20 text-green-400";
    case "failed":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-background text-muted";
  }
}

export default function MangaAdminClient() {
  const [manga, setManga] = useState<AdminMangaListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListAdminMangaParams["status"]>("all");
  const [scraperFilter, setScraperFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<NonNullable<ListAdminMangaParams["sort"]>>("updated");
  const [order, setOrder] = useState<NonNullable<ListAdminMangaParams["order"]>>("desc");
  const [scraperFilterOptions, setScraperFilterOptions] = useState<AdminMangaScraperFilterOption[]>([]);
  const [typeFilterOptions, setTypeFilterOptions] = useState<AdminMangaTypeFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [editModal, setEditModal] = useState<{
    row: AdminMangaListItem;
    manga: Record<string, unknown>;
    chapters: Array<{ id: number; chapterNumber: string; title?: string | null }>;
    scraperId: string | null;
    scraperUrl: string | null;
    isScanActive: boolean;
  } | null>(null);

  const fetchManga = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminManga({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter,
        scraperId: scraperFilter,
        type: typeFilter,
        sort,
        order,
      });
      setManga(result.manga);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load manga");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, scraperFilter, typeFilter, sort, order]);

  useEffect(() => {
    fetchManga();
  }, [fetchManga]);

  useEffect(() => {
    listAdminMangaScraperFilters()
      .then((res) => setScraperFilterOptions(res.filters))
      .catch(() => setScraperFilterOptions([]));
  }, []);

  useEffect(() => {
    listAdminMangaTypeFilters()
      .then((res) => setTypeFilterOptions(res.filters))
      .catch(() => setTypeFilterOptions([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [sort]);

  const openEditModal = async (row: AdminMangaListItem) => {
    setOpeningId(row.id);
    try {
      const [{ manga: fullManga, chapters }, source] = await Promise.all([
        fetchMangaForAdminEdit(row.id),
        adminGetSource(row.id).catch(() => ({
          scraperId: null,
          scraperUrl: null,
          status: null,
          errorMessage: null,
          scanStatus: "idle",
          isQueued: false,
        })),
      ]);

      setEditModal({
        row,
        manga: fullManga,
        chapters,
        scraperId: source.scraperId,
        scraperUrl: source.scraperUrl,
        isScanActive:
          source.status === "scanning" ||
          source.status === "downloading" ||
          source.isQueued,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load manga details");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            type="search"
            placeholder="Search by title…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-foreground border border-borders text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(({ value, label }) => (
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
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Source:</span>
        <select
          value={scraperFilter}
          onChange={(e) => {
            setScraperFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="all">All sources</option>
          <option value="none">No source set</option>
          {scraperFilterOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name} ({opt.count})
            </option>
          ))}
        </select>

        <span className="text-sm text-muted ml-2">Type:</span>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="all">All types</option>
          <option value="none">Type not set</option>
          {typeFilterOptions
            .filter((opt) => opt.id !== "none")
            .map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id} ({opt.count})
              </option>
            ))}
        </select>

        <span className="text-sm text-muted ml-2">Sort:</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as NonNullable<ListAdminMangaParams["sort"]>)}
          className="px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="updated">Latest activity</option>
          <option value="title">Title</option>
          <option value="chapters">Chapters</option>
          <option value="type">Type</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setOrder((o) => (o === "asc" ? "desc" : "asc"));
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-lg text-sm bg-foreground border border-borders text-primary hover:bg-foreground/80"
          title="Toggle sort order"
        >
          {order === "asc" ? "Asc" : "Desc"}
        </button>
      </div>

      <p className="text-sm text-muted">
        {total} series · sorted {order === "asc" ? "A→Z" : "Z→A"}
      </p>

      <div className="bg-foreground rounded-lg overflow-hidden border border-borders">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borders bg-background/50">
                <th className="px-4 py-3 font-semibold text-muted">Manga</th>
                <th className="px-4 py-3 font-semibold text-muted">Type</th>
                <th className="px-4 py-3 font-semibold text-muted">Chapters</th>
                <th className="px-4 py-3 font-semibold text-muted">Import</th>
                <th className="px-4 py-3 font-semibold text-muted">Source</th>
                <th className="px-4 py-3 font-semibold text-muted">Updated</th>
                <th className="px-4 py-3 font-semibold text-muted w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="size-6 animate-spin inline-block mr-2" />
                    Loading manga…
                  </td>
                </tr>
              ) : manga.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    No manga found
                  </td>
                </tr>
              ) : (
                manga.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-borders/50 hover:bg-background/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={getCoverUrl(row.cover)}
                          alt=""
                          width={40}
                          height={56}
                          className="rounded shrink-0 border border-borders object-cover w-10 h-14"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-primary truncate max-w-[220px]">
                            {row.title ?? `Series #${row.id}`}
                          </p>
                          <Link
                            href={`/manga/${row.id}`}
                            target="_blank"
                            className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                          >
                            View page <ExternalLink className="size-3" />
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs capitalize">{row.type ?? "—"}</td>
                    <td className="px-4 py-3 text-primary">{row.chapterCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${importStatusClass(row.importStatus)}`}
                      >
                        {row.importStatus ?? "none"}
                      </span>
                      {row.errorMessage && (
                        <p
                          className="text-xs text-red-400 mt-1 max-w-[180px] truncate"
                          title={row.errorMessage}
                        >
                          {row.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {row.scraperId ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatDate(row.importUpdatedAt ?? row.lastUpdatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(row)}
                        disabled={openingId === row.id}
                        className="p-2 rounded-lg text-muted hover:text-primary hover:bg-background border border-transparent hover:border-borders transition-colors disabled:opacity-50"
                        aria-label={`Edit ${row.title ?? row.id}`}
                      >
                        {openingId === row.id ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : (
                          <EllipsisVertical className="size-5" />
                        )}
                      </button>
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

      {editModal && (
        <AdminMangaEditModal
          mangaId={editModal.row.id}
          mangaTitle={(editModal.manga.title as string) ?? editModal.row.title ?? ""}
          manga={editModal.manga}
          secondaryTitles={editModal.manga.secondaryTitles}
          chapters={editModal.chapters}
          currentScraperId={editModal.scraperId}
          currentScraperUrl={editModal.scraperUrl}
          isScanActive={editModal.isScanActive}
          onClose={() => setEditModal(null)}
          onSourceSet={fetchManga}
          onVariantAdded={fetchManga}
          onChaptersDeleted={fetchManga}
          onMetadataUpdated={fetchManga}
        />
      )}
    </div>
  );
}
