"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PROFILE_PAGE_SIZE } from "@/services/profileService";

export default function ProfilePagination({ page, total, limit = PROFILE_PAGE_SIZE, onPageChange, loading }: { page: number; total: number; limit?: number; onPageChange: (page: number) => void; loading?: boolean }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <button
        type="button"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-foreground border border-borders text-sm text-primary hover:bg-foreground/70 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="size-4" /> Previous
      </button>
      <span className="text-sm text-muted">Page {page} of {totalPages}</span>
      <button
        type="button"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-foreground border border-borders text-sm text-primary hover:bg-foreground/70 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
