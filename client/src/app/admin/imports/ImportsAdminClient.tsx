"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Loader2, EllipsisVertical } from "lucide-react";
import { toast } from "react-toastify";
import { listAdminImportRequests, type AdminImportRequest, type ListAdminImportRequestsParams } from "@/services/adminImportRequestService";
import AdminImportRequestModal from "./AdminImportRequestModal";

const STATUS_FILTERS: { value: ListAdminImportRequestsParams["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export default function ImportsAdminClient() {
  const [requests, setRequests] = useState<AdminImportRequest[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListAdminImportRequestsParams["status"]>("pending");
  const [loading, setLoading] = useState(true);
  const [editingRequest, setEditingRequest] = useState<AdminImportRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminImportRequests({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter,
      });
      setRequests(result.requests);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load import requests");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            type="search"
            placeholder="Search title, user, or series…"
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

      <p className="text-sm text-muted">
        {total} request{total !== 1 ? "s" : ""} total
      </p>

      <div className="bg-foreground rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borders bg-background/50">
                <th className="px-4 py-3 font-semibold text-muted">Title</th>
                <th className="px-4 py-3 font-semibold text-muted">User</th>
                <th className="px-4 py-3 font-semibold text-muted">Series</th>
                <th className="px-4 py-3 font-semibold text-muted">Status</th>
                <th className="px-4 py-3 font-semibold text-muted">Submitted</th>
                <th className="px-4 py-3 font-semibold text-muted w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="size-6 animate-spin inline-block" />
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No import requests found
                  </td>
                </tr>
              ) : (
                requests.map((row) => (
                  <tr key={row.id} className="border-b border-borders/50 hover:bg-background/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-primary line-clamp-2">{row.requestedTitle}</p>
                      {row.requestedUrl && (
                        <p className="text-xs text-muted truncate max-w-[200px]">{row.requestedUrl}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <p>{row.userName}</p>
                      <p className="text-xs">{row.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {row.seriesId ? (
                        <Link href={`/manga/${row.seriesId}`} className="text-accent hover:underline">
                          {row.seriesTitle ?? `#${row.seriesId}`}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${statusClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditingRequest(row)}
                        className="p-2 rounded-lg text-muted hover:text-primary hover:bg-background border border-transparent hover:border-borders transition-colors"
                        aria-label={`Manage request ${row.id}`}
                      >
                        <EllipsisVertical className="size-5" />
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

      {editingRequest && (
        <AdminImportRequestModal
          request={editingRequest}
          onClose={() => setEditingRequest(null)}
          onSaved={(updated) => {
            setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setEditingRequest(updated);
            fetchRequests();
          }}
        />
      )}
    </div>
  );
}
